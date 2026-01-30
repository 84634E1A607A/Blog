---
title: About Me
type: "about"
comments: false
description: 我, 站主 Ajax, 是一个喜欢折腾网络 / 网安 / 软件 / 硬件 / ... 的人. 我对我的博客的定位是一个用于交流技术和思想的地方, 发表的文章偏技术向, 且我尽量使之通俗易懂. 这篇自述中, 我将向所有人展示我生平的一角, 准确而不失有趣地.
---

<style>
.content {
    line-height: 1.5;
}
</style>

博客自带了这个页面, 总得往里面填点东西.

我是 Ajax, 由于 `ajax.top` 太贵了而选择了 [`aajax.top`](https://aajax.top) (也就是本站). 我的邮箱是 i@aajax.top, 欢迎邮件交流~

我的 GPG 公钥在 [这里](https://aajax.top/Ajax.gpg).

我看学长们的博客有人往里面放自己的简历的, ~~但是看看我的生平 (什么) 好像也没啥能放的~~, 还是放一个在这吧: [我的简历](/cv/cv.pdf). 那么这里放点什么呢?

那还是放一点生平罢:

## 关于 Programming 与 Project

我目前 (Time: 2025/1/8) 是一位本科生. 在高三的时候, 我懒得复习高考, 每周末回家写开源游戏 [Thrive](https://revolutionarygamesstudio.com/), 基于 Godot, C#, 还真写了点东西. 不过大学比高中还忙, 就没时间写了.

上溯到高二的时候, 我试图自行实现康威生命游戏, 先写了个 [WinForm 版本](https://github.com/84634E1A607A/ConwayLifeGame), 但是帧间总闪 (擦除导致的), 然后又去学了 MFC, 写了个 [MFC 版本](https://github.com/84634E1A607A/Conway-s-Life-Game-MFC), 带到班上的电脑上 ~~玩~~ 和同学们学习交流, 后来觉得性能要命, 又自学了 Direct2D (只会了一点, 现在已经忘光了), 但是性能还是要命 (这次是因为计算资源不够, 算法复杂度太高), 这就超出我的能力范围了.

为什么呢? 我高中并没有走计算机竞赛方向, 而是正常高考. 因此虽然很能四处瞎搞, 但是毕竟不算科班, 算法还是不太会.

高中我们班主任热衷于给我们的每次考试算排名, 还要一堆乱七八糟的格式. 每次排名她要折腾一整天. 我实在无语, 但是语文老师的电脑上啥也没有, 我自学了 VisualBasic (只会一点), 用 Excel VBA 写了个排名的排名生成器. 不过由于隐私原因, 这份代码并没有流传下来, 我自己也找不着了.

再往上就是小学折腾电脑了, 那时候跟我家长为了玩电脑斗智斗勇, 后来疑似我智胜了xs

Anyway. 高考我没有考到计算机专业, 在电气专业. 大一的时候我们有个实验课要用一个虚拟仪器, 叫 "雨实验" (说白了就是拿我们当小白鼠). 这个玩意的前端写得很烂, 还只有 Windows 版本. 我逆向了它的 USB 串口通信协议, 用 ASP.Net Core (C#) 写了个 [跨平台的 Web 版本](https://github.com/84634E1A607A/RainDropWeb). 不过想必也没啥人用 (当年还是有一点), 找不到接班人, 也就是自己折腾罢了.

大一的程序设计课程要学 C 和 Java, 我大作业按要求写了个 [数独](https://github.com/84634E1A607A/Sudoku_C_Java) 出来, 代表了当时我的 UI 设计能力和码风. 这时候已经被 Thrive 的维护者狠狠教育过码风啥的了, 因此应该还算能看.

我还接触了我们学生自己开发的手机 APP [THU Info APP](https://app.cs.tsinghua.edu.cn/) ( [Github](https://github.com/thu-info-community/thu-info-app) ), 成为了开发者. 主开发者马上本科毕业了, 不过我至今 (Time: 2025/1/8) 也没整明白这个应用的大框架 (主要是懒), 只是在上面修修补补.

到了大一下学期, 我凭借优异的绩点转系成功, 进入了计算机系, 也算是科班出身了. 过来之后, 我加入了 [科协](https://net9.org/home/), 啊对, 就是 *这所大学* 的计算机系科协. 本来以为绝世高手就在此处, 结果发现疫情几年疑似传承出了很大问题. 不过绝世高手确实就在此处, 在学长们的建议下, 这个网站成立了.

暑期有个小学期, 教 Python, 大作业是 [爬虫 + 数据分析 + 前后端](https://github.com/84634E1A607A/2023-summer-python). 写得一坨, 主要是没有优先学习先进技术, 出现了爬虫手写拼接 SQL 等问题. 从这里我深刻认识到了像爬虫这玩意, 错误处理比天大. 前端依然是模板渲染, 我狠狠学习了如何手写 CSS.

计算机系的课和电机系有些区别. 我不得不又修了一遍程序设计课. 这次的大作业使用了 Qt6, 是 [贪吃蛇](https://github.com/UbeCc/SnakeFoP). 此时我才发现 Thrive 对我代码质量的影响非常大, 接触了这些大项目之后, 我对一个项目整体的架构, 思路, 文档等有了更深的认识和可以参考的经验. (换句话说, 眼睛里有点容不下沙子. 不点名批评.)

然后是大二, 学习了 DSA, 上了软件工程课程. 我们寝室三个人同力协作, 写了个我们认为相当 [简陋的 IM 系统](https://github.com/84634E1A607A/nova210se). 结果在期末展示的时候发现我们觉得简陋还是因为我们标准太高了xs, 这份代码交出了老师和助教相当满意的答卷.

转眼间到了大三, 由于数学物理学不会, 我在计算机系很快实现了绩点自由. 在大三的一年我大量魔改了我的博客, 被计算机系逼着自学了不少东西, 让我比较自豪的是网络专题训练的 QUIC 项目 (由于课程要求不便公开).

## 关于网安

最早接触网安也是高中, 当时我把学校的某废弃服务的没有关机的管理系统的 Web 页面给打了, 用任意文件上传漏洞写了 asp Webshell, 进去提权, 开了 RDP, 在里面装 VMWare, 套 Kali, 然后在学校的服务器网段里面瞎玩. 误打误撞找到了我们成绩查询系统的教师权限, 又扫目录利用未授权访问打进了管理员账号. 后来我把这一堆整理了一下给了写这个服务的老师. 这件事到此结束.

然后当时填综合素质评价系统, 我作为网管有我们老师的账号用来审核. 我在里面闲逛, 找到了好几个 SQLi, 但是有 WAF; 然后找到了好几个越权. 我在我们整个用完这个系统之后写了 edusrc, 然后教育局要我们班主任深刻检讨, 我们班主任感到困惑, 此事不了了之. 通过这件事我学到了安全人员的物种多样性. 不解决问题, 可以解决发现问题的人. 我也学到了, 有时候通过漏洞制造一些不大不小的问题是修复漏洞的好方法.

然后就上了大学, 参加了学校网安协会的比赛, 成绩还行. 之后找了个 SQLi 把学校新上线的论坛数据库打了, 跟他们反馈了.

我作为攻击队成员参加了两次教育部护网行动, 拿了小几万分. 实网的安全形势和 CTF 完全不一样, 作为攻击的利剑, CTF 是一点也做不出来 (笑).

## 关于运维

与攻击相对的是防御. 作为科协网络部运维 (就不能不是我嘛...), 科协的服务也属于清华大学的防御面. 科协的一堆服务没有文档, 我大二的时候也算是从头学习如何正确运维, 每看过一个服务就写一点注释和文档, 对于没人用的服务采用 "关了再说" 策略, 对科协的服务进行了一波大清洗. 同时, 我也处理了若干弱密码工单, 若干安全告警, 完善了 Grafana 监控. 这些很多也都写在博客的流水账里面了.

随着大三的落幕, 我在科协的运维工作也告一段落, 或许我已经积累了足够的经验, 或许我对运维的一腔热血已经被时间风干, 但总之, 我为不用再竭力保障系统的高效与安全感到... relief (我的中文记忆库中找不到这个词的准确对应).

## 关于网络

我重构了我们学生节的网, ~~指导~~ 掺和了工物系学生节的网, 折腾了工场的网, 维护了科协的网. STP, LAG, RIP... 什么都要用, 什么都要会. 但是真的会嘛? 好像也不是很会.

我又主持布置了 THUPC 的网, 修好了家里的网, 顺面帮同学修了网, 很快搞明白了隔壁大学的校园网. 现在看, 域内的事情, 我还是会一点. 至于域间的事, 还是交给 ISP 去做吧.

## 关于我

我会什么呢? 好像会很多东西, 又好像啥也不精通. 我只能说, 当我面对一个问题的时候, 我能尽我所能迅速解决它. 我遇到过很多问题, 也解决过很多问题, 这些都是我的经验和我的优势. 这是我学习的能力.

## 也可以去这里看看!

高中和咱折腾网课的 [Nico](https://www.lozumi.com)

THU Info APP 的开发者, 咱的没那么老的老前辈 [Unidy](https://unidy.cn)

是可爱的 [adamanteye](https://blog.adamanteye.cc/) 的笔记喵

写博客眼光独到, 对前端有很高造诣, 在博客里面藏 Cloudflare Access 的 [hash](https://land.hash.moe/) 妹妹 (现在在咱的抗议下取消了, 乐) (但是还是有一大堆访问限制, 咱经常被挡在外面)

评论的二楼 [Clever Jimmy](https://leverimmy.top/)

## Acknowledgements

博客使用了 [Hexo](https://hexo.io/), 主题原本为 [Nlvi](https://github.com/ColMugX/hexo-theme-Nlvi), 后来被咱大兴土木, 现在已经魔改地不成样子了; 现在更是被咱改的完全脱离了原样.

字体是西文 [Roboto](https://fonts.google.com/specimen/Roboto) ([OFL License](https://fonts.google.com/specimen/Roboto/license)); 中文系统不同使用 System Font; 等宽字体 [Jetbrains Mono](https://www.jetbrains.com/lp/mono/) ([SIL OFL 1.1 License](https://www.jetbrains.com/lp/mono/#license)).

博客的 icon 来自 Pixiv 的 [✨](https://www.pixiv.net/en/artworks/125597074), 原作者是 [ぴろ瀬](https://heripiro.tumblr.com/). 我没搞明白这玩意到底 License 是啥, 能不能这么用, 但是不管咋样我写了一封邮件询问, 但是石沉大海, 没有回复. 但是咱还是好像用w, 所以就先用着吧 awa.

Syntax Highlighting 使用 [Shiki](https://shiki.style/), 比自带的好看多了w

### Hexo

> Copyright (c) 2012-present Tommy Chen
> 
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
> 
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
> 
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Nlvi

> MIT License
> 
> Copyright (c) 2017-2019 Co1MugX
> 
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
> 
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
> 
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

### Shiki

> MIT License
> 
> Copyright (c) 2021 Pine Wu
> Copyright (c) 2023 Anthony Fu <https://github.com/antfu>
> 
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
> 
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
> 
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
