# 运维手册

本手册面向运行测试环境的人。**v1.0.0 是首个测试版，尚未经过长期生产环境验证。** 首次启动按 [README](../README.md#在本机试用) 执行；本页接着处理日常运行和故障。

## 你在维护哪些东西

| 对象       | 位置或地址                              | 用途                               |
| ---------- | --------------------------------------- | ---------------------------------- |
| Web        | `127.0.0.1:3000`                        | 访客页面及同源 API 转发            |
| CMS        | `127.0.0.1:3001/admin`                  | 登录、内容和账号管理               |
| PostgreSQL | Compose 的 `postgres` 服务，宿主机 5432 | 内容、账号、审计及版本             |
| 媒体文件   | `apps/cms/.env` 的 `MEDIA_LOCAL_ROOT`   | 四种 WebP 展示图，不保存原件       |
| 应用配置   | 两个应用各自的 `.env`                   | 数据库连接、应用密钥及测试账号密码 |

Compose 项目名为 `association-portal-test`，与自用项目的数据卷分离；同一台主机仍不能重复占用相同端口。不要把两个项目指向同一个数据库或媒体目录。

## 日常启动与停止

在根目录执行 `docker compose up -d --wait postgres`，再执行 `pnpm dev`。检查首页与 `/admin` 均可打开。应用用 Ctrl+C 停止；数据库用 `docker compose stop postgres` 停止。再次启动会使用原有数据。

首次 seed 从 `apps/cms/.env` 建立 owner、staff、cadre 演示账号并发布示例首页。**重跑会重设这些账号密码和首页，不能作为日常启动或正式账号恢复操作。** `demo:init` 也不是配置更新工具；已有文件时会拒绝覆盖。

## 改配置

先停止应用，再编辑 `.env`，最后重启。文件不能提交、截图分享或贴进 Issue。

| CMS 配置             | 设置方式                                                     |
| -------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`       | 本机专用开发库 `ascnucc_demo_dev`；首次迁移前确认目标        |
| `PAYLOAD_SECRET`     | `demo:init` 生成的随机值；保留原值，不要每次启动重生成       |
| `MEDIA_STORAGE_MODE` | 本机试用为 `local`；S3 配置见[媒体手册](媒体与画廊.md)       |
| `MEDIA_LOCAL_ROOT`   | 私有绝对目录，自动初始化为项目的 `.data/media`               |
| `DEMO_*`             | 只供 seed 建立演示账号；修改配置不自动修改数据库中的账号密码 |

Web 的 `CMS_API_URL` 应为 CMS 的内部可达地址；本机使用 `http://127.0.0.1:3001`。此地址由 Web 服务访问，不是让访客浏览器访问的地址。

## 启动失败时

- **5432 被占用**：确认占用者，保留其数据。在 `compose.yaml` 将映射改为 `127.0.0.1:55432:5432`，同时把 CMS `DATABASE_URL` 的端口改成 `55432`，再启动。本仓库两个项目的数据库凭据相似，不能仅凭连接成功判断连对了库。
- **3000/3001 被占用**：停止自己之前启动的测试进程；不要结束不认识的服务。若调整脚本端口，同步修改 Web 的 `CMS_API_URL` 和自己访问的 URL。
- **数据库不健康**：运行 `docker compose ps`、`docker compose logs --tail=80 postgres`，检查启动错误；不要删除数据卷解决连接失败。
- **迁移失败**：停止启动，保留日志，检查连接和错误；不得执行 reset、Down 或直接修改迁移表。记录失败版本，提交可复现问题。
- **媒体配置错误**：确认 local 目录是绝对路径且进程可写，或 S3 配置完整；不能同时保留两套存储配置。
- **后台能开、公开页面不可用**：查看 Web 终端日志和 `CMS_API_URL`，再访问 `http://127.0.0.1:3001/api/v1/content/announcements?page=1&pageSize=1`。API 正常而 Web 失败通常要检查两应用之间的连接。
- **内容 404**：先在后台核对是否已发布；草稿和已下线内容本就不公开。页面显示“暂时无法载入”则记录请求编号及发生时间排查服务日志。

## 保存和恢复本机测试数据

数据库和媒体目录必须一起保存。下面是隔离测试环境的冷备份流程，不是经过生产演练的灾备方案。

1. Ctrl+C 停止 Web/CMS，保持 PostgreSQL 运行。此时没有内容或图片写入。
2. 创建仅自己可访问的备份目录，保存应用版本、两个 `.env` 的安全副本以及整个 `MEDIA_LOCAL_ROOT` 目录。备份含凭据和个人资料时必须加密并限制访问。
3. 导出数据库。Bash/WSL 示例：

```sh
mkdir -p .data/backup
chmod 700 .data/backup
docker compose exec -T postgres pg_dump -U ascnucc_demo -d ascnucc_demo_dev -Fc > .data/backup/database.dump
```

4. 检查命令退出码与文件非空。在另一个隔离的测试环境恢复并核对，备份文件存在不代表可恢复。

恢复时停止目标应用，先还原匹配的媒体目录和配置，然后将数据库恢复到**空的测试数据库**。可用下面命令将恢复点导入独立的 `ascnucc_restore_check` 库（Bash/WSL）：

```sh
docker compose exec -T postgres createdb -U ascnucc_demo ascnucc_restore_check
docker compose exec -T postgres pg_restore -U ascnucc_demo -d ascnucc_restore_check --exit-on-error < .data/backup/database.dump
```

该库已存在时 `createdb` 会失败，先确认是否上次演练结果，不要直接删除。让单独的 CMS 测试实例连接该库，使用备份对应的应用版本和独立媒体目录，检查登录、已发布内容、草稿不可见和画廊四种图片。不要对恢复库运行 seed。跨版本恢复需先验证前向迁移。

## 更新测试环境

先完成上面的备份，再停止双应用，切换到目标版本源码，执行 `pnpm install --frozen-lockfile`、`pnpm --dir apps/cms migrate`，最后启动并检查登录、发布和媒体读取。更新时不重新初始化和 seed。

迁移成功而应用失败时，旧代码未必兼容新数据库；不能只切回代码就认为已经回退。保留离线状态，按日志修复，或在隔离环境恢复完整旧恢复点。

## 容器镜像与正式环境

仓库保留 `Containerfile`、`compose.deploy.yaml` 和 `deploy` 供部署开发与评估。它们使用独立的 `association-portal-web` / `association-portal-cms` 镜像名；只有开源仓库发布流程成功后才有对应镜像。镜像不存在时先检查发布作业，不要改用自用仓库镜像。

v1.0.0 必须显式选择该版本，不能依赖 `latest`/`stable`。镜像部署入口和限制见 [镜像部署](镜像部署.md)。首版尚缺正式 owner 初始化/恢复、管理员多因素认证、个人信息保留策略落地与生产备份恢复演练。开展真实运营前需要补齐并验证这些流程；不能把本机 Demo seed 改成可作用于真实数据库。
