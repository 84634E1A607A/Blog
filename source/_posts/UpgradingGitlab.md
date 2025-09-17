---
updated: 2025-03-23 00:48:09
title: Upgrading Gitlab and Configuring OAuth2 Generic
date: 2024-01-20 10:49:32
description: This post details the process of upgrading Gitlab CE from version 11.1.1 to 16.8.0, addressing encountered issues, debugging OAuth2 integration with a custom identity provider, and configuring the omniauth-oauth2-generic gem for seamless authentication.
tags:
  - 技术
  - 运维
---

前几天我把科协的 Git9 从自编译的 11.1.1 一路升级到 16.8.0, 中途遇到了一些问题, 找了不少资料也解决不了, 因此放在这里.

Days ago, I upgraded Gitlab CE of SAST from 11.1.1 along the [Upgrade Pathway](https://gitlab-com.gitlab.io/support/toolbox/upgrade-path/) to version 16.8.0, the latest version. I encountered some problems, which I cannot solve even after searching New Bing, Google and the official docs. Finally I got it working by debugging our OAuth server *and* the oauth2-generic gem. I'll list my findings here.

<!-- more -->

A few years ago, my seniors wrote a custom gem to complete the OAuth steps with Accounts9, our OAuth identity provider. Due to this, they had to use a self-compiled version of Gitlab. Upgrading that version of Gitlab requires manual upgrades to Ruby, Postgresql, and so on, thus making the instance unmaintainable.

To upgrade it to the latest version, I thought of one way much simpler: I **made a full backup**, set up a virtual machine with Ubuntu 22.04 LTS and **installed Gitlab 11.1.1 (exactly the same version!)** there. After **restoring the backup**, I am able to upgrade it to 16.8.0, step by step.

Now that I have a usable Gitlab instance, it's time to migrate the OAuth authorization method.

Using Omnibus Gitlab, there isn't a way to install a custom OAuth method. However, I do find two possible ways:

### Patching gem directly

OAuth gems are located at `/opt/gitlab/embedded/lib/ruby/gems/3.1.0/gems/omniauth-*`. You can choose one (preferably, `omniauth-oauth2-generic`) and replace it with your own gem.

However I really **DO NOT THINK THIS WAY IS RECOMMENDED**.

### Using `omniauth-oauth2-generic`

[omniauth-oauth2-generic](https://github.com/omniauth/omniauth-oauth2-generic) is a generic OAuth2 strategy provider, but its *feature* is pretty unclear.

By default (starting from *approximately* Gitlab 15.4.6), omniauth-oauth2-generic passes `client_id` and `client_secret` **in `Authorizaiton` header.**

```http
Authorization: Basic base64_encode(client_id:client_secret)
```

And passes `auth_token` **in `Authorization` header**:

```http
Authorization: Bearer auth_token
```

---

So, if you encounter the following error or something like that, remember to check if your OAuth provider supports passing client_id and client_secret via basic auth:

> snakyhash::stringkeyed error='no client secret'

To solve this, check [client.rb](https://gitlab.com/oauth-xx/oauth2/-/blob/main/lib/oauth2/client.rb?ref_type=heads) of [oauth2](https://gitlab.com/oauth-xx/oauth2/) and its [changelog](https://gitlab.com/oauth-xx/oauth2/-/blob/main/CHANGELOG.md#L113). In short, add conf:

```ruby
auth_scheme = "request_body"
```

Alternatively, if modifying your OAuth provider is more of convenience (just like what I did, ) add a line to decode client_id and client_secret from basic auth.

---

And a most confusing step: If your OAuth provider do not support passing auth_token by bearer, Gitlab **WILL NOT WARN YOU** about the auth failure. Instead, it just shows a 422 page, saying *"User e-mail cannot be blank"*.

To move it back to header, I traced to [access_token.rb](https://gitlab.com/oauth-xx/oauth2/-/blob/main/lib/oauth2/access_token.rb#L86) and there is a setting to move it to body or query, but I didn't test how exactly it works.

