# 开发指南

先按根 [README](../../README.md) 启动本机演示环境。后端、公开站点与共享契约分别在 `apps/cms`、`apps/web`、`packages/contracts`。包名中的 `@ascnucc` 是历史内部命名，不连接原站点。

## 修改代码后的检查

```sh
pnpm check
pnpm build
```

`check` 包含格式、ESLint、TypeScript、应用边界和 Vitest。构建需要有效媒体配置；README 的初始化已经提供。构建成功不代表数据库迁移、浏览器流程或生产部署通过。

新增用户输入先更新运行时 Schema；Web 只使用 contracts，不共享 Payload Document。权限、业务状态、事务与存储规则由 CMS 负责。修改后同步对应运维手册，不要把内部任务记录当作使用文档。

## 数据库集成验证

Compose 首次建立卷时会创建三个数据库：`ascnucc_demo_dev` 供人工演示，`ascnucc_demo_test` 供集成/E2E，`ascnucc_demo_migration` 供迁移验证。现有卷不会再次运行初始化 SQL；缺库时先核对连接，再用 PostgreSQL `createdb` 建立缺少的测试库。

将以下环境变量只设置在独立的测试终端，避免改变正在运行的 Demo。POSIX shell 示例（使用 Compose 的虚构本机凭据）：

```sh
export DATABASE_URL=postgres://ascnucc_demo:ascnucc_demo@127.0.0.1:5432/ascnucc_demo_test
export PAYLOAD_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export MEDIA_STORAGE_MODE=local
export MEDIA_LOCAL_ROOT="$(node -e 'process.stdout.write(require("node:path").resolve(require("node:os").tmpdir(), "ascnucc-media-e2e"))')"
mkdir -p "$MEDIA_LOCAL_ROOT"
pnpm --dir apps/cms migrate
pnpm --dir apps/cms seed:migration-fixture
pnpm --dir apps/cms seed:e2e
```

按变更模块选择脚本，完整脚本清单以 `apps/cms/package.json` 为准。例如内容变更执行 `test:announcements`、`test:association-pages`、`test:activities`、`test:news`；账号变更执行 `test:identity-access` 或 `test:membership-account-claim`；历史表单执行 `test:form-versioning` 与 `test:business-loop`。这些脚本会修改虚构测试数据，不能指向业务数据库。

迁移路径探针另用迁移库：

```sh
DATABASE_URL=postgres://ascnucc_demo:ascnucc_demo@127.0.0.1:5432/ascnucc_demo_migration pnpm --dir apps/cms test:migrations
```

保持 `push: false`，只追加迁移，不改已应用文件。表结构、Payload 类型、契约和对应验证作为同一变更审查。

## 浏览器验证

保持前述测试终端的测试库和媒体环境，执行：

```sh
pnpm --dir apps/cms exec playwright install chromium
pnpm build
pnpm --dir apps/cms test:e2e
PLAYWRIGHT_EXPECT_UNAVAILABLE=true PLAYWRIGHT_CMS_API_URL=http://127.0.0.1:39999 pnpm --dir apps/cms test:e2e '.*-unavailable.spec.ts'
```

正常服务测试和服务不可用测试分开执行；后者只运行三个不可用场景。协会页面测试会清理虚构内容并重新建立三个固定页面，因此只允许使用专用测试数据库。

本地媒体目录必须是系统临时目录下的 `ascnucc-media-e2e`，测试配置会拒绝其他目录。

Playwright 自行启动生产模式 Web 3100 和 CMS 3201，不复用开发服务；端口被占用会失败。CMS 可通过 `PLAYWRIGHT_CMS_SERVER_URL` 指定另一个本机空闲端口，Web 固定 3100。报告和 trace 可能含页面数据，只使用虚构数据且不提交生成目录。

媒体的 S3 集成还需要单独的私有测试 bucket，配置见[媒体手册](../../运维手册（人读）/媒体与画廊.md)。普通本地测试不证明任意 S3 供应商兼容。

## 发布代码边界

开源版和自用项目独立维护。只逐项移植通用修复，不合并自用库的完整历史。开源目录不包含自用配置、成员数据、协会素材、历史截图或内部验收报告。初次发布步骤见[发布指南](../releases/README.md)。
