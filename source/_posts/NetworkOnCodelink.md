---
title: Network on Codelink - 帮算协折腾比赛用网
date: 2024-07-07 15:20:21
tags: 网络, 技术
---

你清算协和我北算协 (什么) 共同举办了 华为 "未名9#" 程序设计邀请赛, 赛事上有一些网络的特殊需求, 故找到我和 ldx 一起帮忙搭建比赛用网. 我将在此记录搭建过程中遇到的问题与解决办法, 吸取经验教训.

<!-- more -->

## 技术需求

由于没有电脑, 算协希望参赛选手 "携带自己的笔记本电脑, 使用大赛提供的 U 盘上的 Windows To Go 系统连接大赛网络进行比赛". 即: 连接网络的选手使用的系统为 Windows, 网卡很随机且为无线接入.

比赛有两场, 上午一场为 ACM 类型, 下午为工程类型. 针对 ACM 比赛, 希望 __"选手只能通过大赛专用 (也就是这个) 网络访问 OJ 平台, 且大赛专用网络只能访问 OJ 平台"__, 即:

1. 用户段不具有外网访问的权限
2. OJ 平台本身为外网服务, 不能告知选手真实的域名

同时, 要让 __"选手之间不能互相访问, 选手不能干扰比赛网"__, 即:

3. AP 隔离, 邻居发现隔离
4. ARP 防护, DHCP 防护等

为了追踪可能的异常行为, 需要:

5. 记录 IP, MAC, 登录用户三元绑定
6. 记录 WLAN 在线信息

由于上行链路没有 v6 栈, 故考虑直接禁用 v6 协议.

而对于工程比赛则没有任何限制, 希望网 "足够稳定, 能够满足选手需求".

## 网络设计

其实就是改了改我们 {% post_link StudentFestivalNetwork "学生节的那个网" %}. 那个网的用户段已经做了 DHCP Snooping, ARP Detection, AP 隔离, 二层隔离啥的; 根据需求, 我们添加了:

1. 本地起 DNS, 把 OJ 平台的根域名解析到软路由本机上, 并通过 Nginx 反代到真实的 OJ 平台; 其它的 DNS 全 REFUSE.
2. iptables 直接把所有从用户 VLAN 进来的转发包全丢了
3. DNS 劫持, 把所有到 53 端口的流量全 DNAT 到软路由的 dnsmasq, 防止用户自己设 DNS 上不了网
4. 虽然上不了网, 但是要让 Windows 觉得这个 WiFi 有网. 所以要伪造 `www.msftconnecttest.com`
5. 通过在 Nginx 上配置 filter, 在登录时记录 POST 表单中的用户名, 表单提交的 IP, 从 ARP 表中找 MAC
6. 利用 WLC 的 SNMP 记录 WLAN STA 信息和上线 / 下线时间
7. 利用 ntopng 实时监控流量信息

## 实际问题

由于华为这边优秀的流控策略, 一个网口只能 20Mbps 速率, 配置静态 IP 只能 50Mbps, 感觉不太够; 同一个端口没法做 MACVLAN (不知道为啥, 应该是有安全设置), 一个 MAC 两个 IP 似乎也不行 (也可能是配置错误?). 因此我们考虑同时使用两个墙上的网口, 做基于连接的负载均衡以获得 100Mbps 的理论 (?) 速度.

然后由于某浏览器 "强制" 做 HTTP -> HTTPS 跳转, 我们的 443 端口又不开, 于是部分选手无法访问 OJ 平台. 我们紧急起了一个自签名的 HTTPS 反代解决了这个问题 (但也没有完全解决).

## 配置详解

### 物理层

我们用了 5 个 AP (预期的人数是 80 人, 实际的人数是 20 人...), 一台 24 口 PoE, 一台 WLC, 一台软路由. AP 是个 ⚄ 的布局. 由于 Base 的架构只有一个上行而且是 Access, 为了添加一个新的上行, 我们给下行线上面开了个 VLAN 并给了上行 (有点狗屎, 但是这是最简单不用改 Hyper-V 交换机的方法).

### DNS 劫持

新建 DNS_REDIRECT 链, 把用户段进来的 tcp 和 udp 53 端口的流量 DNAT 到本机.

```sh
iptables -N DNS_REDIRECT
iptables -A PREROUTING -i eth1.2 -p tcp -m tcp --dport 53 -j DNS_REDIRECT
iptables -A PREROUTING -i eth1.2 -p udp -m udp --dport 53 -j DNS_REDIRECT
iptables -A DNS_REDIRECT -j DNAT --to-destination 192.168.32.1
```

然后在本地起 dnsmasq, 打开 `no-resolv`, 把平台的域名解析到本机的反代:

```text
address=/my.oj.cn/192.168.32.1
```

同时把 `www.msftconnecttest.com` 解析到本机:

```text
address=/www.msftconnecttest.com/192.168.32.1
```

此时 dnsmasq 只知道这两个域名的地址, 于是其它的域名都会被 REFUSE 掉.

### Nginx 反代 - msftconnecttest

```nginx
server {
        listen 80;
        server_name www.msftconnecttest.com;

        location /connecttest.txt {
                default_type text/plain;
                return 200 "Microsoft Connect Test";
        }

        location / {
                return 204;
        }
}
```

### Nginx 反代 - OJ 平台

为了记录登录信息, 新建了一个 log_format, 在登录时调用 lua 脚本解析登录信息, 记录到日志中.

```nginx
log_format login_log_format '[$time_local] Login from $remote_addr ($remote_mac) username `$username`';
```

然后是一些 SSL 配置:

```nginx
ssl_dhparam /etc/ssl/certs/dhparam.pem;

server {
        listen 80;
        listen 443 ssl;
        ssl_certificate /etc/ssl/certs/nginx-selfsigned.crt;
        ssl_certificate_key /etc/ssl/private/nginx-selfsigned.key;

        server_name my.oj.cn;

        access_log /var/log/nginx/access.log;
        error_log /var/log/nginx/error.log;
```

然后对 `/api/login` 进行特殊处理, 把请求扔进 lua 脚本中解析登录信息, 记录到日志中, 然后反代到真实的 OJ 平台. 这里要写两个 access_log, 因为更靠里的会覆盖全局的 Log 属性, 只有同级的两个才是同时记录:

```nginx
        location /api/login {
                proxy_pass https://actual.oj.cn;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;

                if ($request_method = POST) {
                        set $username "Failed to call lua function";
                        set $remote_mac "Failed to call lua function";
                        access_by_lua_file /etc/nginx/lua-scripts/parse_login.lua;

                        access_log /var/log/nginx/login.log login_log_format;
                        access_log /var/log/nginx/access.log;
                }
        }
```

然后是默认的反代:

```nginx
        location / {
                proxy_pass https://actual.oj.cn;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
        }
}
```

生成自签名证书的方法是:

```sh
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/nginx-selfsigned.key -out /etc/ssl/certs/nginx-selfsigned.crt
openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048
```

获取 Body 的 lua 脚本是:

```lua
local cjson = require "cjson"

local function extract_username()
    ngx.req.read_body()

    -- 这里拿 Data
    local data = ngx.req.get_body_data()
    if not data then
        ngx.log(ngx.ERR, "Failed to get request body")
        ngx.var.username = "Failed to get body"
        return
    end

    local decoded, err = cjson.decode(data)
    if not decoded then
        ngx.log(ngx.ERR, "Failed to decode JSON: ", err)
        ngx.var.username = "Failed to decode JSON"
        return
    end

    -- 从解析好的 JSON 里面找 Username
    local username = decoded.username
    if not username then
        ngx.log(ngx.ERR, "Username not found in JSON")
        ngx.var.username = "Not found in JSON"
        return
    end

    -- 写回 Nginx $username 变量
    ngx.var.username = username
end
```

获取 MAC 的脚本是:

```lua
local function get_mac_address(ip)
    local arp_file = io.popen("cat /proc/net/arp")
    if not arp_file then
        return nil, "Failed to open ARP table"
    end

    -- Read ARP table contents
    local arp_table = arp_file:read("*a")
    arp_file:close()

    -- Search for the given IP in the ARP table
    for line in arp_table:gmatch("[^\r\n]+") do
        local fields = {}
        for field in line:gmatch("%S+") do
            table.insert(fields, field)
        end

        if fields[1] == ip then
            return fields[4], nil -- MAC address is the 4th field
        end
    end

    return nil, "IP address not found in ARP table"
end
```

这里用到了 `lua` 拓展, 这个一般需要 OpenResty apt package (而不是普通的 nginx); 相应的, 其配置文件也不在 `/etc/nginx/nginx.conf` 里, 而是在 `/etc/openresty/nginx.conf` 里. 为了与 Nginx 原生配置保持一致, 可以用 `include /etc/nginx/sites-enabled/*;`. 对应用 `openresty -t` 和 `openresty -s reload` 来检查和重载配置.

### 按连接负载均衡

我们使用了简单的 round-robin 模式进行负载均衡. 两条上行链路是 `eth0` 和 `wan9`, 使用 CONNMARK 标记连接:

```sh
iptables -t mangle -A PREROUTING -i eth1.2 -m conntrack --ctstate NEW -m state --state NEW -m statistic --mode nth --every 2 --packet 0 -j CONNMARK --set-xmark 0x9/0xffffffff
```

用于对从用户段出去的 *新* 连接, 每两个包选中一个, 标记 *连接* 为 `0x9`. 然后根据数据包所属的连接标记打 fwmark, 用策略路由的方式选择出口, 进行负载均衡.

```sh
iptables -t mangle -A PREROUTING -i eth1.2 -j CONNMARK --restore-mark --nfmask 0xffffffff --ctmask 0xffffffff

ip rule add fwmark 0x9 lookup 9
ip route add default via 10.0.0.1 dev wan9 table 9
```

## 总结 & 一些想法

整个网络没有出什么太大的锅, 唯一一个是在刚开始把反代的目标从测试系统换成正式系统的时候两个链接只改了一个, 选手能登录但是别的东西都是旧的, 无权访问. 这 Highlight 了 Nginx 配置中使用 `host` 块的重要性.

除了 Windows, 如何欺骗手机 / Mac / Linux 认为 WiFi 有网? Linux 倒问题不大, 反正不管有没有网, 连上之后 Linux 不会瞎搞自动帮你断开; 但是手机就很容易切换到流量上去了.

此外, 我发现我们使用的那个赛事域名实际上开了 HSTS. *如果* 选手在外网访问过这个域名, 我们的自签名证书就没用了. 下次如果有类似的需求, 应该搞一个 NXDOMAIN 的域名. 另外, 如果能拿到正经的 SSL 证书也很好的选择.

`ifupdown` 真**难用! (找个小学弟用 systemd-networkd 重写一遍 (bushi))

这次还发现了一个特性: 一开始我没有启用 `WPA`, 只允许 `WPA2 PSK`, Windows 连不上我们的 WiFi; 启用 WPA 之后就好了. WPA2 都这么多年了, Windows 怎么还强制要求可以使用 WPA 啊... (也可能是 WTG 版本太低了?)

在非网络的方面: 为啥要用 WTG + SDI 的 ** 方式啊... 用最新的 Ubuntu 24.04 LTS Live CD 或者啥的不是更好 (?) 不过他们算协的估计也不是很确信这样能用.

比赛的组织也比较混乱, 选手的参赛率也比较惨淡 (x), 希望下次能更好一些.

最近跟算协啊, 工场啊讨论了一下, 大家都去卷去了, 学生组织就要倒闭啦~~~ 真好 (x)
