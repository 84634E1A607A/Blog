---
title: 如何获取 iDRAC 7 / 8 的 Enterprise License
updated: 2025-07-14 17:16:34
date: 2025-07-14 16:29:51
description: 本文探讨了如何为 Dell R630 服务器的 iDRAC7 和 iDRAC8 获取 Enterprise License，由于官方已停止支持，文章提供了两种方法：一是通过 smbios-sys-info 修改 Service Tag 为 9QYZF42 并导入 License 文件；二是对于 iDRAC8，通过更改服务器跳线设置来修改 Service Tag。结论是，尽管存在技术挑战，但用户可以通过这些方法获得 iDRAC Enterprise License，从而获得更全面的服务器管理功能。
tags:
  - 技术
  - 硬件
  - 运维
---

前两天试图上线机房里面的两台 R630 服务器, 惊奇地发现这两台的 License 都是 Express, 没有 Remote Console. 那么怎么才能搞到 Enterprise License 呢? 官方已经停止支持了, 买不到了. 打开淘宝, 上面有卖的, 但是总觉得买了会被坑. 遂上网查了查, 得到了一些方法. (侵删)



<!-- more -->



## 一开始的方法

参考: https://blog.mylab.top/post/dell-idrac7%E7%A0%B4%E8%A7%A3/ 和 https://pastebin.com/LQ8C7pgs

{% fold "原文" %}

```plaintext
iDRAC7 Enterprise crack keygen
(This will change your Dell service tag, you won't get iDRAC7 enterprise without having this service tag, 9QYZF42)
 
find and download "OMSA71-CentOS6-x86_64-LiveDVD.iso". It must be this older version, newer versions replaced a tool we want with a dumbed down version.
 
Boot into it from the server and launch gnome-terminal
run these commands
su
smbios-sys-info --service-tag --set=9QYZF42
reboot
 
You may notice some "upgrading" screens. This is normal
Once the system is booted log into the iDRAC
 
Your new service tag should be updated to 9QYZF42
Open your favorite file editor and create a new XML file with the contents at the bottom of the page, starting at <?xml...
Load this file as a license in your iDRAC, log out, and back in.
 
You now have iDRAC7 enterprise!
 
Since iDRAC authenticates using your service tag, if you go back, the license will revert to idrac basic.
This obviously isn't a solution for business because duplicate service tags will cause big problems on your network during deployment, and if somebody decides to call in for service.
 
This isn't a terrible idea for the average homelabber though.
 
Tested on 12th generation poweredge servers, Dell PowerEdge R#20/T#20
 
 
<?xml version="1.0"?>
<!--Copyright (c) 2010-2011 Dell Inc. All Rights Reserved.-->
<lns:LicenseClass xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:lns="http://www.dell.com/2011/12G/licensing">
  <lns:LicenseData>
    <lns:Schema lns:Vendor="Dell" lns:ID="iDRAC" lns:maxDepth="255" lns:SchemaVersion="2.0"/>
    <lns:TransferableLicense>true</lns:TransferableLicense>
    <lns:UTCdateSold>2013-07-30T03:04:11Z</lns:UTCdateSold>
    <lns:EntitlementID>DE00000009660549</lns:EntitlementID>
    <lns:DeviceClass lns:ID="iDRAC"/>
    <lns:ProductDescription>
      <lns:lang_en>iDRAC7 Enterprise License</lns:lang_en>
      <lns:lang_es>iDRAC7 Enterprise License</lns:lang_es>
      <lns:lang_fr>iDRAC7 Enterprise License</lns:lang_fr>
      <lns:lang_de>iDRAC7 Enterprise License</lns:lang_de>
      <lns:lang_it>iDRAC7 Enterprise License</lns:lang_it>
      <lns:lang_ja>iDRAC7 Enterprise License</lns:lang_ja>
      <lns:lang_zh>iDRAC7 Enterprise License</lns:lang_zh>
    </lns:ProductDescription>
    <lns:LicenseTerm>
      <lns:Perpetual/>
    </lns:LicenseTerm>
    <lns:Restrictions>
      <lns:ServiceTag>9QYZF42</lns:ServiceTag>
    </lns:Restrictions>
    <lns:DeviceInfo lns:ID="1" lns:VendorID="0x1912" lns:DeviceID="0x0011"/>
    <lns:Feature lns:ID="1" lns:Description="License Management" lns:Enabled="true"/>
    <lns:Feature lns:ID="2" lns:Description="RACADM" lns:Enabled="true"/>
    <lns:Feature lns:ID="3" lns:Description="WSMAN" lns:Enabled="true"/>
    <lns:Feature lns:ID="4" lns:Description="SNMP" lns:Enabled="true"/>
    <lns:Feature lns:ID="5" lns:Description="Auto Discovery" lns:Enabled="true"/>
    <lns:Feature lns:ID="6" lns:Description="USC Firmware Update" lns:Enabled="true"/>
    <lns:Feature lns:ID="7" lns:Description="Update Package" lns:Enabled="true"/>
    <lns:Feature lns:ID="8" lns:Description="USC Operating System Deployment" lns:Enabled="true"/>
    <lns:Feature lns:ID="9" lns:Description="USC Device Configuration" lns:Enabled="true"/>
    <lns:Feature lns:ID="10" lns:Description="USC Diagnostics" lns:Enabled="true"/>
    <lns:Feature lns:ID="11" lns:Description="Power Budget" lns:Enabled="true"/>
    <lns:Feature lns:ID="12" lns:Description="Power Monitoring" lns:Enabled="true"/>
    <lns:Feature lns:ID="13" lns:Description="Virtual Media" lns:Enabled="true"/>
    <lns:Feature lns:ID="14" lns:Description="Telnet" lns:Enabled="true"/>
    <lns:Feature lns:ID="15" lns:Description="SMASH CLP" lns:Enabled="true"/>
    <lns:Feature lns:ID="16" lns:Description="IPv6" lns:Enabled="true"/>
    <lns:Feature lns:ID="17" lns:Description="Dynamic DNS" lns:Enabled="true"/>
    <lns:Feature lns:ID="18" lns:Description="Dedicated NIC" lns:Enabled="true"/>
    <lns:Feature lns:ID="19" lns:Description="Directory Services" lns:Enabled="true"/>
    <lns:Feature lns:ID="20" lns:Description="Two-Factor Authentication" lns:Enabled="true"/>
    <lns:Feature lns:ID="21" lns:Description="Single Sign-On" lns:Enabled="true"/>
    <lns:Feature lns:ID="22" lns:Description="PK Authentication" lns:Enabled="true"/>
    <lns:Feature lns:ID="23" lns:Description="Crash Screen Capture" lns:Enabled="true"/>
    <lns:Feature lns:ID="24" lns:Description="Crash Video Capture" lns:Enabled="true"/>
    <lns:Feature lns:ID="25" lns:Description="Boot Capture" lns:Enabled="true"/>
    <lns:Feature lns:ID="26" lns:Description="Virtual Console" lns:Enabled="true"/>
    <lns:Feature lns:ID="27" lns:Description="Virtual Flash Partitions" lns:Enabled="true"/>
    <lns:Feature lns:ID="28" lns:Description="Console Collaboration" lns:Enabled="true"/>
    <lns:Feature lns:ID="29" lns:Description="Device Monitoring" lns:Enabled="true"/>
    <lns:Feature lns:ID="30" lns:Description="Remote Inventory" lns:Enabled="true"/>
    <lns:Feature lns:ID="31" lns:Description="Storage Monitoring" lns:Enabled="true"/>
    <lns:Feature lns:ID="32" lns:Description="Remote Firmware Update" lns:Enabled="true"/>
    <lns:Feature lns:ID="33" lns:Description="Remote Firmware Configuration" lns:Enabled="true"/>
    <lns:Feature lns:ID="34" lns:Description="Remote Inventory Export" lns:Enabled="true"/>
    <lns:Feature lns:ID="35" lns:Description="Remote Operating System Deployment" lns:Enabled="true"/>
    <lns:Feature lns:ID="36" lns:Description="Backup and Restore" lns:Enabled="true"/>
    <lns:Feature lns:ID="37" lns:Description="Part Replacement" lns:Enabled="true"/>
    <lns:Feature lns:ID="38" lns:Description="SSH" lns:Enabled="true"/>
    <lns:Feature lns:ID="39" lns:Description="Remote File Share" lns:Enabled="true"/>
    <lns:Feature lns:ID="40" lns:Description="Virtual Folders" lns:Enabled="true"/>
    <lns:Feature lns:ID="41" lns:Description="Web GUI" lns:Enabled="true"/>
    <lns:Feature lns:ID="42" lns:Description="Network Time Protocol" lns:Enabled="true"/>
    <lns:Feature lns:ID="43" lns:Description="Email Alerts" lns:Enabled="true"/>
    <lns:Feature lns:ID="44" lns:Description="Security Lockout" lns:Enabled="true"/>
    <lns:Feature lns:ID="45" lns:Description="Remote Syslog" lns:Enabled="true"/>
    <lns:Feature lns:ID="253" lns:Description="Integrated Dell Remote Access Controller 7 Enterprise" lns:Enabled="true"/>
  </lns:LicenseData>
<dsig:Signature xmlns:dsig="http://www.w3.org/2000/09/xmldsig#">
<dsig:SignedInfo>
<dsig:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
<dsig:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
<dsig:Reference URI="">
<dsig:Transforms>
<dsig:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
</dsig:Transforms>
<dsig:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
<dsig:DigestValue>jEuefYR4MBMs4Ucd9WbRjihpZe4=</dsig:DigestValue>
</dsig:Reference>
</dsig:SignedInfo>
<dsig:SignatureValue>P7vr8XFES9T4w+c9Z6uQPq9muMpGv0Dj44El2coPPrkHkkNz5YdZ2qY9vXo+3gcb
HdLT0e1/s99zfgIwWPfg9fT/XbAr831+pPynhNDRaUoFr93PGA3KmMFOarL8Fe9e
DQZp4pIkaPsDfZtkqcUevdKpTRYf+98ZU9advk3Q+yDdyyTHuhTqTw91McglPJLc
R6ckZ2N1uMPKdSXp7pVDBLE0X8VVLliCG4NL8ro2B4p1wBzUYXWHRm8arIzwTyWI
c3RmnqcwrKoVHF3SabgUf0ALAtICYk3dR3lI5tYm8Bzkdk+b89JXZx/jkdHvRrx6
kY9hX72aH2dJxdk1DzEbCw==</dsig:SignatureValue>
<dsig:KeyInfo>
<dsig:X509Data>
<dsig:X509Certificate>MIIDTjCCAjagAwIBAgIBATANBgkqhkiG9w0BAQUFADBRMRMwEQYDVQQKEwpEZWxs
LCBJbmMuMSEwHwYDVQQLExhFbWJlZGRlZCBMaWNlbnNlIE1hbmFnZXIxFzAVBgNV
BAMTDkNBIENlcnRpZmljYXRlMB4XDTEwMDEwMTAwMDAwMFoXDTM1MTIzMTIzNTk1
OVowVjETMBEGA1UEChMKRGVsbCwgSW5jLjEhMB8GA1UECxMYRW1iZWRkZWQgTGlj
ZW5zZSBNYW5hZ2VyMRwwGgYDVQQDExNTaWduaW5nIENlcnRpZmljYXRlMIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqbRo2DZtkjxl5YtqD5ePYdzrWbkU
YQJwVaWYe1tE7ZAdou5TLTsjPnaa1cLcPTexn+cq8YjukIVwkwJP7yJ5GkrYGUnf
0Q6unWWgwcgTStlpflz31e8AbxXqNYZEFvEktojYS0kAfiYES+H02GUU5PtV7B9Y
BbtZEowU2DPuqRGG1FF8mAsp1vojcbQGx+nS2Of47oQJRrJlh28COXyf2w/+IRAz
RmeYin+9pisfrT9fmlUtxa7sAAV/KZFRx8ED31YiktXgI/u/PNnHlchiCMaL6pzA
HMBf115O7A2y6IZ9sXUHvH8V9QnDkWT1XHMn8GCW8HXOA5zA232OxiaRmQIDAQAB
oywwKjAJBgNVHRMEAjAAMB0GA1UdDgQWBBQAoZ7yMjDHMAFtmmmO/zyz3BJ6hjAN
BgkqhkiG9w0BAQUFAAOCAQEAHHgoOg57S+lAEejahdBE1HMwe6BF3b9bzUMCynn9
7buXa3cnRFO3H3674WKU6nBjv4nkT3qMyXwgi7MvXcu69msK4eM6QA8XeC7G1rD+
2bb/ENR9R9Zo0BWLym/ij8uUA/BzX8hnbzWxN82+FMdY9WD4fJAJwJ5ZPEbU1Vfy
7wOWosHgDPXjeAhlhkxDQi6vlRTJdfED6tBY7iGD4AQXfzrHzAZpZlIvKbM2c54B
65wMSlqfEWMBDhT5qcwGCq82hmi7/sCtu9Z20g2s9F0fp4XlGX8L7l0hCa46zjay
37GffYsScEDFg/DmkIpcXnGzyx8l1msLzpj8Gt4zHhPlgA==</dsig:X509Certificate>
</dsig:X509Data>
</dsig:KeyInfo>
</dsig:Signature></lns:LicenseClass>
```

{% endfold %}

总结如下:

- 这里面泄漏了一个可用的 iDRAC 7 License
- 需要把 Rx20 的 Service Tag 改成 `9QYZF42`
- 这之后导入 License 即可



而改 Service Tag 的方法是用 `smbios-sys-info` (https://packages.debian.org/sid/admin/smbios-utils , https://launchpad.net/ubuntu/noble/+package/smbios-utils)

```bash
smbios-sys-info --service-tag --set=9QYZF42
```

重启 iDRAC 之后就会发现 Service Tag 已经更改了.



## iDRAC 8

这启发了我们: iDRAC 8 是不是也有类似的操作呢? 我们机房里面有一些设备是有 Enterprise License 的, 也就是说, 只要我们成功更改 Service Tag 就能摇身一变.

于是我去寻找了一下如何改 Service Tag. 于是: https://www.winreflection.com/change-service-tag-of-a-dell-server/

> 1. Open the server and locate the “System Board Jumper Settings” <-- 这是一个 6 pin 的跳线
> 2. Move PWRD_EN jumper to pin 4-6 parallel to the NVRAM_CLR jumper and turn on the server.
> 3. When the boot menu pops up Press “F2” to enter “System Setup”
> 4. Find and select “Service Tag Settings”.
> 5. Delete the old service tag and type the new one then click OK and restart the server.
> 6. Turn off the server and move back the PWRD_EN to the original position then turn on the server.

于是照做, 即可成功.

https://topic.alibabacloud.com/a/dell-idrac-certificate_8_8_31099535.html

https://blog.51cto.com/tianshili/1883097

https://gist.albert.lol/albert/289b74ec92a141cfa70dd99f8ab709c6

{% fold "iDRAC8 自己想办法" %}

```xml
PD94bWwgdmVyc2lvbj0iMS4wIj8+DQo8IS0tQ29weXJpZ2h0IChjKSAyMDEwLTIwMTEgRGVsbCBJ
bmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuLS0+DQo8bG5zOkxpY2Vuc2VDbGFzcyB4bWxuczpkcz0i
aHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnIyIgeG1sbnM6eHNpPSJodHRwOi8vd3d3
LnczLm9yZy8yMDAxL1hNTFNjaGVtYS1pbnN0YW5jZSIgeG1sbnM6bG5zPSJodHRwOi8vd3d3LmRl
bGwuY29tLzIwMTEvMTJHL2xpY2Vuc2luZyI+DQogIDxsbnM6TGljZW5zZURhdGE+DQogICAgPGxu
czpTY2hlbWEgbG5zOlZlbmRvcj0iRGVsbCIgbG5zOklEPSJpRFJBQyIgbG5zOm1heERlcHRoPSIy
NTUiIGxuczpTY2hlbWFWZXJzaW9uPSIyLjAiLz4NCiAgICA8bG5zOlRyYW5zZmVyYWJsZUxpY2Vu
c2U+dHJ1ZTwvbG5zOlRyYW5zZmVyYWJsZUxpY2Vuc2U+DQogICAgPGxuczpVVENkYXRlU29sZD4y
MDIyLTA2LTA5VDAzOjE1OjM1WjwvbG5zOlVUQ2RhdGVTb2xkPg0KICAgIDxsbnM6RW50aXRsZW1l
bnRJRD5ETEYwMDAwMzQyNTkzNDYwPC9sbnM6RW50aXRsZW1lbnRJRD4NCiAgICA8bG5zOkRldmlj
ZUNsYXNzIGxuczpJRD0iaURSQUMiLz4NCiAgICA8bG5zOlByb2R1Y3REZXNjcmlwdGlvbj4NCiAg
ICAgIDxsbnM6bGFuZ19lbj5pRFJBQzggRW50ZXJwcmlzZSBMaWNlbnNlPC9sbnM6bGFuZ19lbj4N
CiAgICAgIDxsbnM6bGFuZ19lcz5pRFJBQzggRW50ZXJwcmlzZSBMaWNlbnNlPC9sbnM6bGFuZ19l
cz4NCiAgICAgIDxsbnM6bGFuZ19mcj5pRFJBQzggRW50ZXJwcmlzZSBMaWNlbnNlPC9sbnM6bGFu
Z19mcj4NCiAgICAgIDxsbnM6bGFuZ19kZT5pRFJBQzggRW50ZXJwcmlzZSBMaWNlbnNlPC9sbnM6
bGFuZ19kZT4NCiAgICAgIDxsbnM6bGFuZ19pdD5pRFJBQzggRW50ZXJwcmlzZSBMaWNlbnNlPC9s
bnM6bGFuZ19pdD4NCiAgICAgIDxsbnM6bGFuZ19qYT5pRFJBQzggRW50ZXJwcmlzZSBMaWNlbnNl
PC9sbnM6bGFuZ19qYT4NCiAgICAgIDxsbnM6bGFuZ196aD5pRFJBQzggRW50ZXJwcmlzZSBMaWNl
bnNlPC9sbnM6bGFuZ196aD4NCiAgICA8L2xuczpQcm9kdWN0RGVzY3JpcHRpb24+DQogICAgPGxu
czpMaWNlbnNlVGVybT4NCiAgICAgIDxsbnM6UGVycGV0dWFsLz4NCiAgICA8L2xuczpMaWNlbnNl
VGVybT4NCiAgICA8bG5zOlJlc3RyaWN0aW9ucz4NCiAgICAgIDxsbnM6U2VydmljZVRhZz43M1RO
TksyPC9sbnM6U2VydmljZVRhZz4NCiAgICA8L2xuczpSZXN0cmljdGlvbnM+DQogICAgPGxuczpE
ZXZpY2VJbmZvIGxuczpJRD0iMSIgbG5zOlZlbmRvcklEPSIweDE5MTIiIGxuczpEZXZpY2VJRD0i
MHgwMDExIiBsbnM6U3Vic3lzdGVtVmVuZG9ySUQ9IjB4MTAyOCIgbG5zOlN1YnN5c3RlbURldmlj
ZUlEPSIweDEiLz4NCiAgICA8bG5zOkZlYXR1cmUgbG5zOklEPSIyNTMiIGxuczpEZXNjcmlwdGlv
bj0iSW50ZWdyYXRlZCBEZWxsIFJlbW90ZSBBY2Nlc3MgQ29udHJvbGxlciA4IEVudGVycHJpc2Ui
IGxuczpFbmFibGVkPSJ0cnVlIi8+DQogIDwvbG5zOkxpY2Vuc2VEYXRhPg0KPGRzaWc6U2lnbmF0
dXJlIHhtbG5zOmRzaWc9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyMiPg0KPGRz
aWc6U2lnbmVkSW5mbz4NCjxkc2lnOkNhbm9uaWNhbGl6YXRpb25NZXRob2QgQWxnb3JpdGhtPSJo
dHRwOi8vd3d3LnczLm9yZy8yMDAxLzEwL3htbC1leGMtYzE0biMiLz4NCjxkc2lnOlNpZ25hdHVy
ZU1ldGhvZCBBbGdvcml0aG09Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvMDkveG1sZHNpZyNyc2Et
c2hhMSIvPg0KPGRzaWc6UmVmZXJlbmNlIFVSST0iIj4NCjxkc2lnOlRyYW5zZm9ybXM+DQo8ZHNp
ZzpUcmFuc2Zvcm0gQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcj
ZW52ZWxvcGVkLXNpZ25hdHVyZSIvPg0KPC9kc2lnOlRyYW5zZm9ybXM+DQo8ZHNpZzpEaWdlc3RN
ZXRob2QgQWxnb3JpdGhtPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwLzA5L3htbGRzaWcjc2hhMSIv
Pg0KPGRzaWc6RGlnZXN0VmFsdWU+akE5ajcxWE9rK01JWTRUMEcyazV4NkpmTHNrPTwvZHNpZzpE
aWdlc3RWYWx1ZT4NCjwvZHNpZzpSZWZlcmVuY2U+DQo8L2RzaWc6U2lnbmVkSW5mbz4NCjxkc2ln
OlNpZ25hdHVyZVZhbHVlPmVSc0xsZm5yRFhSdWlPN0dtRzhvanFYc1BDMXVWZmpZOWUwYXRMWGZO
U0lJLzhLem5SNzVyQVBsZGRFVUV1VGcNCjZWTXAvcWtLVGJBMEQwU0ZwUVFSR3NHbFZlaW40T0FP
ZUQvRmh4d3dXYm9RTkVPUkI1N1RFWWI4MmtjVkRNTXoNCkxoUm5DdTBFUXpKckppalJETUFweE91
R09wZWpsRHUyUkwwd2RhZDdrWW9sTWJwZFNQT2lXSGJSSzE5dytiWVcNClZRTCs2ZTBEUUc5Q1Z4
WWoreHZjS2pxaW9QTUV2V2tNSUpZQ1V4ZjRNeUR3V0lEcFpWaUFoWE1vb1JCS2Eza1ANCm1PWkp6
NjAvRnRuQTNJdEVqQjBsWVZQZzhrbnRBUzR1dVhDYzNrclJuaUttdmRYVTdFQ3U4c0trbCtwL1Jv
WGMNCkl3SXBDelJEQUJRanN2M0RXWWtuaGc9PTwvZHNpZzpTaWduYXR1cmVWYWx1ZT4NCjxkc2ln
OktleUluZm8+DQo8ZHNpZzpYNTA5RGF0YT4NCjxkc2lnOlg1MDlDZXJ0aWZpY2F0ZT5NSUlEVGpD
Q0FqYWdBd0lCQWdJQkFUQU5CZ2txaGtpRzl3MEJBUVVGQURCUk1STXdFUVlEVlFRS0V3cEVaV3hz
DQpMQ0JKYm1NdU1TRXdId1lEVlFRTEV4aEZiV0psWkdSbFpDQk1hV05sYm5ObElFMWhibUZuWlhJ
eEZ6QVZCZ05WDQpCQU1URGtOQklFTmxjblJwWm1sallYUmxNQjRYRFRFd01ERXdNVEF3TURBd01G
b1hEVE0xTVRJek1USXpOVGsxDQpPVm93VmpFVE1CRUdBMVVFQ2hNS1JHVnNiQ3dnU1c1akxqRWhN
QjhHQTFVRUN4TVlSVzFpWldSa1pXUWdUR2xqDQpaVzV6WlNCTllXNWhaMlZ5TVJ3d0dnWURWUVFE
RXhOVGFXZHVhVzVuSUVObGNuUnBabWxqWVhSbE1JSUJJakFODQpCZ2txaGtpRzl3MEJBUUVGQUFP
Q0FROEFNSUlCQ2dLQ0FRRUFxYlJvMkRadGtqeGw1WXRxRDVlUFlkenJXYmtVDQpZUUp3VmFXWWUx
dEU3WkFkb3U1VExUc2pQbmFhMWNMY1BUZXhuK2NxOFlqdWtJVndrd0pQN3lKNUdrcllHVW5mDQow
UTZ1bldXZ3djZ1RTdGxwZmx6MzFlOEFieFhxTllaRUZ2RWt0b2pZUzBrQWZpWUVTK0gwMkdVVTVQ
dFY3QjlZDQpCYnRaRW93VTJEUHVxUkdHMUZGOG1Bc3Axdm9qY2JRR3grblMyT2Y0N29RSlJySmxo
MjhDT1h5ZjJ3LytJUkF6DQpSbWVZaW4rOXBpc2ZyVDlmbWxVdHhhN3NBQVYvS1pGUng4RUQzMVlp
a3RYZ0kvdS9QTm5IbGNoaUNNYUw2cHpBDQpITUJmMTE1TzdBMnk2SVo5c1hVSHZIOFY5UW5Ea1dU
MVhITW44R0NXOEhYT0E1ekEyMzJPeGlhUm1RSURBUUFCDQpveXd3S2pBSkJnTlZIUk1FQWpBQU1C
MEdBMVVkRGdRV0JCUUFvWjd5TWpESE1BRnRtbW1PL3p5ejNCSjZoakFODQpCZ2txaGtpRzl3MEJB
UVVGQUFPQ0FRRUFISGdvT2c1N1MrbEFFZWphaGRCRTFITXdlNkJGM2I5YnpVTUN5bm45DQo3YnVY
YTNjblJGTzNIMzY3NFdLVTZuQmp2NG5rVDNxTXlYd2dpN012WGN1Njltc0s0ZU02UUE4WGVDN0cx
ckQrDQoyYmIvRU5SOVI5Wm8wQldMeW0vaWo4dVVBL0J6WDhobmJ6V3hOODIrRk1kWTlXRDRmSkFK
d0o1WlBFYlUxVmZ5DQo3d09Xb3NIZ0RQWGplQWhsaGt4RFFpNnZsUlRKZGZFRDZ0Qlk3aUdENEFR
WGZ6ckh6QVpwWmxJdktiTTJjNTRCDQo2NXdNU2xxZkVXTUJEaFQ1cWN3R0NxODJobWk3L3NDdHU5
WjIwZzJzOUYwZnA0WGxHWDhMN2wwaENhNDZ6amF5DQozN0dmZllzU2NFREZnL0Rta0lwY1huR3p5
eDhsMW1zTHpwajhHdDR6SGhQbGdBPT08L2RzaWc6WDUwOUNlcnRpZmljYXRlPg0KPC9kc2lnOlg1
MDlEYXRhPg0KPC9kc2lnOktleUluZm8+DQo8L2RzaWc6U2lnbmF0dXJlPjwvbG5zOkxpY2Vuc2VD
bGFzcz4NCg==

```

{% endfold %}
