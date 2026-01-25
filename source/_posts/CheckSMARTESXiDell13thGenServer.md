---
title: How to get drive SMART status on Dell 12th / 13th Gen Servers with ESXi
updated: 2026-01-25 16:19:45
date: 2026-01-25 10:39:35
description: "This article addresses the challenge of monitoring drive health on Dell 12th/13th Gen servers running ESXi by demonstrating the use of perccli to extract raw SMART hex data, concluding that parsing this output with scripts or AI effectively circumvents standard tool limitations."
tags:
  - 运维
---

If you are running ESXi on Dell 12th or 13th generation servers, you might want to check the SMART status of your drives to monitor their health. For me, it's when one of the RAID5 drives failed, and I wonder whether the other drives could fail soon. However, the standard SMART tools won't work. After some investigation, I found a way to get the SMART raw data with `perccli` command.

TL, DR:

```sh
/opt/lsi/perccli/perccli64 /call/eall/sall show smart
```

This will print the raw SMART data in hex format. I haven't found a good parser for this, just feed it to ChatGPT along with the drive model, and ask him to parse it for you.

Or, I asked CodeX to tailor `smartctl` to read from the hex blob and targets WASM. [Try it yourself!](https://smart.aajax.top)

<!-- more -->

## The Incident

A few days ago, I received an alert "iDRAC Status", that says one of my drives had failed. I logged into iDRAC and saw it fell off the bus, then reconnected, and was then rebuilding. The SMART status was OK from the iDRAC web interface, but since the drive had fallen once, I asked now leaders of SAST to find spare drives and replace it soon.

One day later, I received another alert, the same drive failed during rebuild and was marked Failed. Again, I asked them to replace it ASAP. This time, I wanted to check the SMART status of ALL drives to see if any other drives were in danger of failing soon. They are all 10 years old.

## The Investigation

iDRAC 8 doesn't have detailed SMART status for drives, only a bollean value of whether the drive is healthy. ESXi can't read SMART data from disks behind Dell PERC RAID controller, it can only get HBA disks' SMART data. I searched and asked ChatGPT, with little progress.

Anyway, I knew there was `storcli` for LSI controllers, and I searched for ESXi version. (Google "storcli ESXi {version}" and you will find it). I installed it with difficulty (but anyway, I succeeded), but it didn't work with Dell PERC controllers.

I then tried to use `smartctl` (sounds promising, right?) with `-d megaraid,N` option. We use this when we are running a *regular* Linux distribution. However, it actually didn't work.

```sh
/opt/smartmontools/smartctl -a -d megaraid,0 /dev/disks/naa.xxx
smartctl 7.5 2025-04-30 r5714 [x86_64-linux-7.0.3] (local build) Copyright (C) 2002-25, Bruce Allen, Christian Franke, www.smartmontools.org

Smartctl open device: /dev/disks/naa.xxx [megaraid_disk_00] failed: can't get bus number
```

It looks like the required ioctl to get the bus number is not implemented in ESXi's tailored kernel.

Then I found [`perccli`](https://www.dell.com/support/home/en-hk/drivers/driversdetails?driverid=5v7xx), a Dell-specific version of `storcli`. The installation command looked like

```sh
esxcli software vib install -d /tmp/VMWare-perccli64_007.1910.zip --no-sig-check
```

Although the installation process exited with failure, saying that the backup boot bank was corrupt bla bla bla, it actually worked. I ran `ln -s /opt/lsi/perccli64/perccli64 /bin/perccli64` so that I could run `perccli64` directly.

```text
[root@esxi:~] perccli64 show
CLI Version = 007.1910.0000.0000 Oct 08, 2021
Operating system = VMkernel 7.0.3
Status Code = 0
Status = Success
Description = None

Number of Controllers = 1
Host Name = esxi.hera.net9.org
Operating System  = VMkernel 7.0.3
StoreLib IT Version = 07.2000.0200.0200
StoreLib IR3 Version = 16.14-0

System Overview :
===============

------------------------------------------------------------------------
Ctl Model        Ports PDs DGs DNOpt VDs VNOpt BBU sPR DS EHS ASOs Hlth
------------------------------------------------------------------------
  0 PERCH730Mini     8   7   3     0   3     0 Opt On  3  N      0 Opt
------------------------------------------------------------------------

Ctl=Controller Index|DGs=Drive groups|VDs=Virtual drives|Fld=Failed
PDs=Physical drives|DNOpt=Array NotOptimal|VNOpt=VD NotOptimal|Opt=Optimal
Msng=Missing|Dgd=Degraded|NdAtn=Need Attention|Unkwn=Unknown
sPR=Scheduled Patrol Read|DS=DimmerSwitch|EHS=Emergency Spare Drive
Y=Yes|N=No|ASOs=Advanced Software Options|BBU=Battery backup unit/CV
Hlth=Health|Safe=Safe-mode boot|CertProv-Certificate Provision mode
Chrg=Charging | MsngCbl=Cable Failure
```

I wasn't trying to get SMART data at that time, actually. iDRAC was not responding and I was trying to directly access the PERC controller to get rebuild status. But when I typed `perccli64 help`, I saw there was a `show smart` command.

```text
[root@esxi:~] perccli64 /c0/e32/s0 show smart
CLI Version = 007.1910.0000.0000 Oct 08, 2021
Operating system = VMkernel 7.0.3
Controller = 0
Status = Success
Description = Show Drive Smart Info Succeeded.

Smart Data Info /c0/e32/s0 =
01 00 05 32 00 64 64 25 00 00 00 00 00 00 09 32
... (512 bytes of hex SMART blob)
```

## The Parser

But the output is raw hex, instead of human-readable, clean table of SMART attributes. I searched for an online parser, unfortunately, I couldn't find any. I asked ChatGPT to find some, he couldn't, either. But for now, I'll list some suggenstions here:

- Just feed the hex to ChatGPT and ask him to decode it. Optionally provide the drive model so he can find accurate attribute meanings.

- Ask ChatGPT to generate a Python script to parse the hex blob into SMART attributes. Here's one ChatGPT generated for me:
  
  {% fold SMART.py %}
  ```python
  #!/usr/bin/env python3
  import argparse
  import re
  import sys
  from typing import Dict, List, Tuple
  
  
  ATTR_NAMES: Dict[int, str] = {
      0x01: "Raw_Read_Error_Rate",
      0x03: "Spin_Up_Time",
      0x04: "Start_Stop_Count",
      0x05: "Reallocated_Sector_Ct",
      0x07: "Seek_Error_Rate",
      0x09: "Power_On_Hours",
      0x0A: "Spin_Retry_Count",
      0x0C: "Power_Cycle_Count",
      0xAA: "Unknown_AA",
      0xAB: "Unknown_AB",
      0xAC: "Unknown_AC",
      0xAD: "Unknown_AD",
      0xAE: "Unknown_AE",
      0xB7: "Unknown_B7",
      0xB8: "End-to-End_Error",
      0xBB: "Reported_Uncorrectable_Errors",
      0xBC: "Command_Timeout",
      0xBD: "High_Fly_Writes",
      0xBE: "Airflow_Temperature_Cel",
      0xBF: "G-sense_Error_Rate",
      0xC0: "Power-off_Retract_Count",
      0xC1: "Load_Cycle_Count",
      0xC2: "Temperature_Celsius",
      0xC3: "Hardware_ECC_Recovered",
      0xC5: "Current_Pending_Sector",
      0xC6: "Offline_Uncorrectable",
      0xC7: "UDMA_CRC_Error_Count",
      0xE1: "Unknown_E1",
      0xE2: "Unknown_E2",
      0xE3: "Unknown_E3",
      0xE4: "Unknown_E4",
      0xE8: "Unknown_E8",
      0xE9: "Unknown_E9",
      0xEC: "Unknown_EC",
      0xF1: "Total_LBAs_Written",
      0xF2: "Total_LBAs_Read",
      0xF9: "Unknown_F9",
      0xFC: "Unknown_FC",
  }
  
  
  def le48(raw6: bytes) -> int:
      return int.from_bytes(raw6, "little", signed=False)
  
  
  def extract_smart_hex_section(text: str) -> str:
      """
      Only keep the content after the 'Smart Data Info ... =' line.
      This prevents accidental capture of 'c0', '7.0.3', etc. from headers.
      """
      m = re.search(r"(?im)^\s*Smart\s+Data\s+Info.*=\s*$", text)
      if not m:
          raise ValueError("Could not find 'Smart Data Info ... =' line in input.")
  
      # Take everything after that line
      return text[m.end():]
  
  
  def parse_hex_bytes(hex_text: str) -> bytes:
      hex_pairs = re.findall(r"\b[0-9a-fA-F]{2}\b", hex_text)
      if not hex_pairs:
          raise ValueError("No hex byte pairs found after 'Smart Data Info ... =' line.")
      return bytes(int(x, 16) for x in hex_pairs)
  
  
  def decode_ata_smart_read_data(b: bytes) -> Tuple[int, List[Tuple[int, int, int, int, int, bytes]]]:
      # ATA SMART READ DATA is 512 bytes; some tools may show fewer if truncated,
      # but the attribute table requires at least 2 + 30*12 bytes.
      min_len = 2 + 30 * 12
      if len(b) < min_len:
          raise ValueError(f"SMART blob too short: got {len(b)} bytes; need at least {min_len} bytes.")
  
      rev = int.from_bytes(b[0:2], "little")
  
      attrs = []
      base = 2
      for i in range(30):
          e = b[base + 12 * i : base + 12 * (i + 1)]
          aid = e[0]
          if aid == 0x00:
              continue
          flags = int.from_bytes(e[1:3], "little")
          cur = e[3]
          worst = e[4]
          raw6 = e[5:11]
          raw = le48(raw6)
          attrs.append((aid, flags, cur, worst, raw, raw6))
      return rev, attrs
  
  
  def format_table(name: str, rev: int, attrs: List[Tuple[int, int, int, int, int, bytes]]) -> str:
      title = f"SMART Attributes: {name}"
      lines = [title, "=" * len(title), f"SMART revision: {rev}", ""]
  
      header = ["ID", "Attribute", "Current", "Worst", "Raw"]
      rows: List[List[str]] = []
  
      for aid, flags, cur, worst, raw, raw6 in attrs:
          attr_name = ATTR_NAMES.get(aid, "Unknown")
          if aid in (0xC2, 0xBE) and len(raw6) >= 1:
              # Common convention: temperature is stored in raw byte 0
              raw_display = f"{raw} (temp={raw6[0]}C)"
          else:
              raw_display = str(raw)
          rows.append([f"{aid:02X}", attr_name, str(cur), str(worst), raw_display])
  
      colw = [len(h) for h in header]
      for r in rows:
          for i, v in enumerate(r):
              colw[i] = max(colw[i], len(v))
  
      def fmt_row(r: List[str]) -> str:
          return "  ".join(v.ljust(colw[i]) for i, v in enumerate(r))
  
      lines.append(fmt_row(header))
      lines.append(fmt_row(["-" * w for w in colw]))
      for r in rows:
          lines.append(fmt_row(r))
      return "\n".join(lines)
  
  
  def main() -> int:
      ap = argparse.ArgumentParser()
      ap.add_argument("-n", "--name", default="(stdin)", help="Name to display in the output table title")
      args = ap.parse_args()
  
      text = sys.stdin.read()
      if not text.strip():
          print("No input on stdin.", file=sys.stderr)
          return 2
  
      try:
          smart_hex = extract_smart_hex_section(text)
          blob = parse_hex_bytes(smart_hex)
          rev, attrs = decode_ata_smart_read_data(blob)
          print(format_table(args.name, rev, attrs))
          return 0
      except Exception as e:
          print(f"Error: {e}", file=sys.stderr)
          return 1
  
  
  if __name__ == "__main__":
      raise SystemExit(main())
  ```

  {% endfold %}

- ChatGPT suggested that we may use skdump to parse the hex blob. It requires a libatasmart format blob. May be able to craft one from the hex data above, but I doubt if it is actually worth the effort.

- My thoughts: maybe I can adjust smartctl to read from hex blob and print SMART data. Let's try it with CodeX.
<<<<<<< HEAD

## The Webtool

So I forked the smartmontools repo, and asked CodeX to help me modify `smartctl` to read from the hex blob above. He did this pretty well, and compiled it to WASM. Then I asked him to build a frontend web page to use this modified `smartctl` to parse the hex blob. The tool is now live at [smart.aajax.top](https://smart.aajax.top). Just paste device data and the hex blob into the textarea, and click "Parse SMART Data", you will get a clean SMART attribute table.

See [this link](https://smart.aajax.top/?sn=PHLA8105012N256CGN&md=INTEL%20SSDSC2KW256G8&fw=LHF002C&rd=01000532006464250000000000000932006464d68e00000000000c320064640e000000000000aa33005c5c00000000000000ab3200555523000000000000ac3200646400000000000000ad33005e5e35009900630000ae320064640c000000000000b73200646400000000000000b83300646400000000000000bb3200646420000000000000be32001a211a002100180000c0320064640c000000000000c73200646400000000000000e132006464a69e0700000000e23200646400000000000000e33200646400000000000000e43200646400000000000000e833005c5c00000000000000e932005a5a00000000000000ec32005a5a00000000000000f132006464a69e0700000000f23200646418100900000000f9320064644f640000000000fc320064646300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005303000100020f000000000000000000000000204c484630303243000000000000534d32323539dc0500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000af) for an example input.
=======
>>>>>>> origin/master
