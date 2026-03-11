"""Run macro-correct against blog posts and emit contextual findings.

Recommended invocation from repo root:

    stdbuf -oL -eL env PYTHONUNBUFFERED=1 \
      /home/ajax/miniconda3/envs/macro-correct-blog/bin/python \
      scripts/run_macro_correct_scan.py \
      --output macro-correct-report.json \
      --threshold 0.9 \
      --batch-size 32 \
      --max-errors 10000

Notes:
- `stdbuf -oL -eL` + `PYTHONUNBUFFERED=1` keeps progress line-buffered.
- The script is read-only with respect to posts; it only writes the JSON report.
- It is fine to review and edit posts while the scan is still running.
"""

import argparse
import json
import os
import re
from pathlib import Path


def strip_markdown(text: str) -> str:
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"{%.*?%}", "", text)
    return text


def iter_candidate_lines(path: Path):
    text = strip_markdown(path.read_text(encoding="utf-8"))
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith(("#", ">", "![", "|", "```")):
            continue
        if re.match(r"^\d+\.\s", line):
            line = re.sub(r"^\d+\.\s+", "", line)
        elif line.startswith(("- ", "* ")):
            line = line[2:].strip()
        if len(line) < 6:
            continue
        zh_count = sum("\u4e00" <= ch <= "\u9fff" for ch in line)
        if zh_count < 4:
            continue
        yield lineno, line


def batched(items, size: int):
    for idx in range(0, len(items), size):
        yield items[idx: idx + size]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--posts-dir", default="source/_posts")
    parser.add_argument("--output", default="macro-correct-report.json")
    parser.add_argument("--threshold", type=float, default=0.9)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-errors", type=int, default=200)
    parser.add_argument("--progress-every", type=int, default=10)
    args = parser.parse_args()

    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
    os.environ.setdefault(
        "PATH_MACRO_CORRECT_MODEL",
        str(Path(".macro-correct-cache").resolve()),
    )

    from macro_correct.predict_csc_token_zh import MacroCSC4Token

    path_config = (
        Path(os.environ["PATH_MACRO_CORRECT_MODEL"])
        / "output"
        / "text_correction"
        / "macbert4mdcspell_v3"
        / "csc.config"
    )
    print(f"[macro-correct] loading model from {path_config}", flush=True)
    model = MacroCSC4Token(path_config=str(path_config))
    correct = model.func_csc_token_batch

    report = []
    posts = sorted(Path(args.posts_dir).glob("*.md"))
    total_lines = 0
    for post in posts:
        candidates = list(iter_candidate_lines(post))
        if not candidates:
            continue
        print(
            f"[macro-correct] scanning {post} ({len(candidates)} candidate lines)",
            flush=True,
        )
        for batch_idx, batch in enumerate(batched(candidates, args.batch_size), start=1):
            texts = [text for _, text in batch]
            results = correct(
                texts,
                threshold=args.threshold,
                batch_size=args.batch_size,
                max_len=128,
                flag_confusion=False,
            )
            total_lines += len(batch)
            for (lineno, source), result in zip(batch, results):
                errors = result.get("errors") or []
                if not errors:
                    continue
                finding = {
                    "file": str(post),
                    "line": lineno,
                    "source": source,
                    "target": result.get("target"),
                    "errors": errors,
                }
                report.append(finding)
                print(
                    f"[macro-correct] finding {len(report)}: {post}:{lineno}",
                    flush=True,
                )
                print(f"  source: {source}", flush=True)
                print(f"  target: {result.get('target')}", flush=True)
                for wrong, right, pos, *rest in errors:
                    extra = ""
                    if rest:
                        extra = f" score={rest[0]}"
                    print(
                        f"  edit: pos={pos} '{wrong}' -> '{right}'{extra}",
                        flush=True,
                    )
                if len(report) >= args.max_errors:
                    break
            if batch_idx % args.progress_every == 0:
                print(
                    f"[macro-correct] progress: {post} batch {batch_idx}, "
                    f"scanned {total_lines} lines, findings {len(report)}",
                    flush=True,
                )
            if len(report) >= args.max_errors:
                break
        if len(report) >= args.max_errors:
            break

    Path(args.output).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"[macro-correct] wrote {len(report)} findings to {args.output} "
        f"after scanning {total_lines} lines",
        flush=True,
    )


if __name__ == "__main__":
    main()
