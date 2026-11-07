---
title: AirMagnet 许可证认证逻辑分析
updated: 2026-11-07 18:20:27
date: 2026-11-07 15:31:14
description: 基于 AirMagnet WiFi Analyzer 与 Survey Planner 的在用版本, 分析许可证文件结构, 申领与离线校验流程, 序列号校验码算法及网卡支持范围. 结果表明, 授权由 PKCS#7 签名, 内置 RSA 公钥, 产品标识与网卡 MAC 地址绑定共同约束, 因此两类产品的授权不能交叉使用; 序列号校验码仅由序列号生成, 软件不校验证书信任链, 签名证书过期不影响许可证使用. 文中还梳理文件解析限制与配套驱动.
tags:
  - 网络安全
  - 技术
---

前年我 {% post_link "AutumnSemester2024#无线移动网络技术" "上李贺武老师的无线移动网络技术课程" %}, 然后入了这个坑, 进了这个组; 今年也是当上助教了. 前年就听说这课程的实验器材很贵, 要好好保存, 千万别弄坏了; 今年我拿到器材之后一看, 发现里面不仅有当年的两个网卡, 还有另外一张看上去 USB 接口被外力掰断了的网卡. 另外, 这两个网卡一个授权了 Survey, 一个授权了 Analyzer, 不能交叉使用. 这是为什么呢? 于是, 我用 DeepSeek 研究了一下 AirMagnet 的许可证认证方式, 但是这篇博客仅供学习交流使用, 绝对不要用于盗版破解用途哦! 对了, GPT 跟我说, Windows 11 24H2 大改了驱动, 这个软件最好在 Windows 10 22H2 上使用.

<!-- more -->

## 软件版本

我在我们的电脑里面找到了软件当年的安装包 [AirMagnet WiFi Analyzer](https://pub-570bd3284bfe42aa87d23a2f35d5303f.r2.dev/AirMagnet-WiFi-Analyzer-11-3-2-bld-37781.exe) 和 [AirMagnet Survey Planner](https://pub-570bd3284bfe42aa87d23a2f35d5303f.r2.dev/AirMagnet-SurveyPlanner-10-3-1-bld-37171.exe). 考虑到我在网上翻了个遍也没找到安装包, 我觉得有必要留档一下. 看上去这是 Analyzer 的最新版本; Survey Planner 的最新版本 12.1 版本的官网好像被 PHP 击落了 (详见 [PHP2Shell](https://www.cisa.gov/news-events/alerts/2026/10/21/critical-vulnerabilities-php-require-immediate-patching)), 但是我发动搜索精神找了一遍, 还真让我 [找到了](https://pub-570bd3284bfe42aa87d23a2f35d5303f.r2.dev/AirMagnet-SurveyPlanner-12-1-0-bld-37323.exe).

本文的分析还是基于我们正在使用的版本. 12.1 版本似乎要在 Windows 11 上运行, 我就懒得试验了.

## 授权结构

我们的 License 文件叫 `A1150-[REDACTED].lic`, 里面的内容如下:

```ini
[Property]
SERIALNUMBER=A1150-xxxxxxxx
SERIALKEY=xxxx-xxxx-xxxx
TIMESTAMP=2021.09.xx.xx:xx:xx
HOSTLOCKADDRESS=2CF05DXXXXXX
VERSIONCONTROL=37881
CULTURECODE=0
COMPANYID=0

[AnalyzerLT]
VERSION=300
LICENSES=1
SPECTRUM_INTEGRATION=1
4_9GHz_SUPPORT=1
LT_TO_LT_MODE=1
802_11A_200CH=1
ALLREPORT=1
802_11n_ADVANCED=1
OPTION1170=0
LITEUPGRADEPRO=1
SmartDDA=1

[SPECTRUM_INTEGRATION]
LICENSES=1
...
[SIGNATURE]
3082099806092A864886F70D010702A0820989...
```

文件是一个 ini 文本, 字段受一张关键字表约束: 每个键对应一个内部 id 和一组语义标志, 标明它属于哪个产品族, 是不是时间锁字段. 解析时用 `=` 切成两半, 左边查表拿 id, 右边整段作为值, 未知键静默忽略. 核心字段:

| 关键字 | 用途 |
| --- | --- |
| `Property` | 属性段名, 映射到固定的段 id |
| `SERIALNUMBER` | 序列号, 前 5 位决定产品 |
| `SERIALKEY` | 序列号的校验码 |
| `TIMESTAMP` | 签发时间 |
| `VERSIONCONTROL` | 允许的最低程序版本 |
| `VERSION` | license 格式版本, 固定 300 |
| `LICENSES` | 段内特性开关 |
| `STARTDATE` / `EXPIRATIONDATE` | 时间锁 |
| `HOSTLOCKADDRESS` | MAC 锁 |
| `HOSTLOCKSERIAL` | 硬件序列号锁 |
| `CULTURECODE` / `COMPANYID` | 区域与客户 |
| `SIGNATURE` | 签名起点 |

特性段 (`AnalyzerLT`, `SiteSurveyor`, `SPECTRUMXT` 等) 各有自己的 id, `LICENSES=1` 表示可用, `0` 表示不可用. `SIGNATURE` 是整份文件唯一的防篡改手段, `[SIGNATURE]` 之前的所有字节都在签名覆盖范围内.

## 签名证书

把 `[SIGNATURE]` 段按十六进制解成 DER, 得到的是一段 PKCS#7 的 `SignedData`:

```text
ContentInfo
 └─ SignedData
     ├─ digestAlgorithms: MD5
     ├─ encapContentInfo: id-data, 内容就是 [SIGNATURE] 之前的正文
     ├─ certificates: 签发者的 X.509 证书
     └─ signerInfos
         ├─ issuerAndSerialNumber: 指向上面那张证书
         ├─ digestAlgorithm: MD5
         ├─ signatureAlgorithm: md5WithRSAEncryption
         └─ signature: 签名
```

证书字段:

```text
subject=C=US, ..., O=Netscout Systems Inc, CN=Netscout Systems Inc
issuer=C=GB, ..., O=COMODO CA Limited, CN=COMODO RSA Code Signing CA
notBefore=2016-06-20, notAfter=2019-06-20
```

可以看到, 这玩意当年还是由一个受信任的 CA 签发的代码签名证书. 不过无所谓, 反正软件只校验 RSA Pubkey, 不校验证书是否受信任, 所以证书过期了也能用. 签名算法是 `md5WithRSAEncryption`, 不过考虑到自己好像没法随便要求 NetAlly 签证书, 所以也没法通过碰撞攻击造一个 2099 年过期的来了 (真不幸!).

## 申请流程

翻找日志能发现, 当年安装这个软件的时候, 证书是通过 SN 联网下载的.

```text
License/Dist Setup:  - no license.
License/Dist Setup:  - Download license selected.
... [FetchLicenseFile] Querying backend server ... for license download.
    License info: serialNumber=A1150-xxxxxxxx&serialKey=xxxx-xxxx-xxxx&macAddress=2C:F0:5D:XX:XX:XX&buildNumber=...
... Backend returns code 200: Valid product license, writing license file.
... Valid License File: ...\TempAMLicAMS.lic
... Valid License File: ...\A1150-[REDACTED].lic
```

客户端提交序列号, 序列号校验码, MAC 和构建号, 后端找到后返回一份签名的 `.lic` 文件; 以后就直接校验这个文件, 不再联网验证.

## 序列号校验码

`SERIALKEY` 我觉得意义不明, 可能是为了防止手滑...? 但是明明后面的 RSA 签名才是防伪标识... 而且 Key 只和 Serial 有关, Serial 呢... 感觉和什么都没有关系...

生成 Key 的算法如下:

{% fold "神秘算法" %}

```py
#!/usr/bin/env python3
# AirMagnet SERIALNUMBER -> SERIALKEY (Parser.dll RVA 0x1B20E0).

SALT = bytes([0x21, 0x03, 0x01, 0x45, 0x71, 0x24])

def serial_key(serial):
    s = [b for b in serial.encode("latin-1") if b != 0x2D]
    n = len(s)
    if not n:
        return ""
    st = bytearray(0x30)
    st[0x13] = 0x0B
    st[0x18:0x1E] = SALT
    for c in s:
        st[0x13] = (st[0x13] + c) & 0xFF
    r = st[0x13] % 5
    p = min(r + 1, n - 1)
    for k in range((r + 1) * 0x5D):
        i = 0x18 + k % 6
        st[i] = (st[i] + s[p]) & 0xFF
        p = (p + 1) % n
    bl, al = st[0x1D], (st[0x1C] + st[0x19]) & 0xFF
    cl = al
    al ^= st[0x1B]
    cl ^= bl
    bl = (bl + st[0x1A]) & 0xFF
    st[0x22] = cl
    cl = (st[0x1A] + st[0x18]) & 0xFF
    bl = (bl + st[0x19]) & 0xFF
    cl ^= st[0x1B]
    dl = al
    al = (cl * st[0x1A] + st[0x22]) & 0xFF
    st[0x24] = bl
    st[0x20] = al
    al = ((bl * st[0x1B]) & 0xFF) ^ st[0x20]
    bl = st[0x20]
    st[0x21] = al
    al = (al + st[0x1C]) & 0xFF
    st[0x13] = al
    st[0x22] = al ^ dl
    a = st[0x1A]
    bl = (bl + a) & 0xFF
    cl ^= bl
    bl = st[0x21]
    v = (st[0x20], bl, st[0x22], cl, (dl + bl + a) & 0xFF, st[0x13] ^ cl)
    return "%02x%02x-%02x%02x-%02x%02x" % v
```

{% endfold %}

## 校验

1. 首先查找软件安装目录下的所有 `.lic` 文件, 依次解析

2. 对于每一个文件, 以文本模式打开 (读进来的实际上是 `LF` 结尾的文件), **读最多 10KB** (想不到吧... 如果 License 太长了会截断导致签名验证失败...), 去里面查找 `[SIGNATURE]` 块

3. 把这个标识的前一个字节置 `\0`, 这样就能直接字符串比较 License 内容和签名里面的是否一致了

4. 把标志后面的 HEX 解析为 binary (解析的时候只认大写字母, 小写字母丢弃...)

5. 调用 Windows CryptoAPI 验证签名 (不验证信任链)

6. 把签名里面的被签名内容和 `[SIGNATURE]` 前面的内容按字节比较 (不是, 你何苦呢... 你反正总要解析这个内容的, 你直接用 DER 里面的不就好了... 用 PEM 还能再省一点地方...)

7. 把签名里面的 RSA 公钥和程序里面写死的公钥比较 (所以我直接把程序里面写死的公钥给改了不就完了...)

8. 根据 `SERIALNUMBER` 计算 `SERIALKEY` (意义是?... 检查自己的证书服务器有没有坏吗... 你都验证过签名了...)

9. 检查序列号前 5 位前缀表, 确认证书对应的产品 ID, 不符合的跳过

10. 检查授权里面的网卡 MAC 地址在机器上有没有, 或者许可证是否到期

## 总结

看过了这个校验逻辑, 我脑子里有一百个何意味... 但是又觉得好像有点道理. 可能是一开始的时候 License 完全靠 License Key 验证, 后来发现这样不行, 被破解了, 又给补充了一个 RSA 签名... 但是想想又觉得不太可能, 这听上去怎么这么抽象呢?

## 网卡支持

他们带了驱动包:

| 驱动 | 芯片 |
| --- | --- |
| `rtwlanu_x64.sys` | Realtek 8812AU/8814AU (AC USB) |
| `netwlflkx64.sys` | Broadcom BCM43A0 |
| `AMIWL6_V_x64.sys` / `AMIWL6A_V_x64.sys` | Intel 6200/6300, 6205/6250 |
| `amtransv_x64.sys` / `amtrans64.sys` | AmTrans 过滤层 |
| `arusbv_x64.sys` | Atheros AR9170 (DWA-160 等) |
| `athrflkx.sys` | Atheros AR9380/9390 |
| `IWLAGN*.sys` | Intel 4965/5100/5300 (旧版残留, 未被清单引用) |
| `AMOSPORT*.sys` | 频谱适配器残留, 未被清单引用 |

可用的网卡有:

Analyzer

| 硬件 ID | 型号 | 驱动 |
| --- | --- | --- |
| `USB\VID_2C2B&PID_0002` | **NETSCOUT D1080 (8814AU)** | rtwlanu_x64 |
| `USB\VID_08C4&PID_0115` | **Proxim 9100 (8814AU)** | rtwlanu_x64 |
| `USB\VID_7392&PID_A833` | **Edimax AC1750 (8814AU)** | rtwlanu_x64 |
| `USB\VID_0BDA&PID_8813` | **Alfa AWUS1900 (8814AU)** | rtwlanu_x64 |
| `PCI\VEN_14E4&DEV_43A0` | Broadcom BCM43A0 (含 MacBook 子系统 ID) | netwlflkx64 |
| `PCI\VEN_168C&DEV_0030&SUBSYS_3112168C` | Atheros HB112 (AR9390) | athrflkx |
| `PCI\VEN_8086&DEV_422B&4238` | Intel 6300 | ami_wl6_v_x64 |
| `PCI\VEN_8086&DEV_0087&0089` | Intel 6250 | ami_wl6A_v_x64 |
| `PCI\VEN_8086&DEV_0082&0085` | Intel 6205 | ami_wl6A_v_x64 |
| `USB\VID_1435&PID_0804` | Proxim 8494 | arusbv_x64 |

Surveyor

| 硬件 ID | 型号 | 驱动 |
| --- | --- | --- |
| `USB\VID_2C2B&PID_0002` | **NetScout 8814AU** | rtwlanu_x64 |
| `USB\VID_08C4&PID_0115` | **Proxim 9100** | rtwlanu_x64 |
| `USB\VID_2001&PID_331A` | D-Link 1900 | rtwlanu_x64 |
| `USB\VID_0BDA&PID_8813` | **Alfa AWUS1900** | rtwlanu_x64 |
| `USB\VID_7392&PID_A833` | **Edimax AC1750** | rtwlanu_x64 |
| `USB\VID_7392&PID_A822` | Edimax AC1200 (8812AU) | rtwlanu_x64 |
| `USB\VID_20F4&PID_805B` | TRENDnet AC1200 (8812AU) | rtwlanu_x64 |

其实只有 8814AU 的各种贴牌卡可用.
