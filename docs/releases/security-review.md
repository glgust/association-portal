# 首版依赖检查

检查日期：2026-09-14。`pnpm audit --prod` 使用 npm 已知漏洞数据库；依赖命中不等于项目中的具体调用路径已确认可利用，也不涵盖所有未知漏洞。

## 本次修复

- Next.js 16.2.6 → 16.3.5。上游修复包括 Windows 服务端路径相关 RCE 和 AVIF 图片优化相关 RCE，见 [Next.js 官方公告](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)。
- sharp 0.34.5 → 0.35.4，处理原生图像库安全修复，见 [sharp 官方公告](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)。
- Payload 及同系列包统一升级到 3.89.0；`AuthUsers.access.unlock` 明确拒绝通用解锁，保持项目自己的账号生命周期规则。
- 对命中的 DOMPurify、PostCSS、fast-uri、undici、js-yaml、nanoid、Browserslist 和 baseline-browser-mapping 在同一主版本内固定修复版本，记录于根包 `pnpm.overrides`。这些覆盖需要随上游升级复查。

原锁文件审计报告：2 critical、22 high、28 moderate、4 low。修复后的实际审计统计及验证限制以 [validation.md](validation.md) 为准。未开展渗透测试或长期生产观察，不将依赖审计当作安全认证。

## 剩余公告

复查剩余一项 moderate：[GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)，依赖路径为 Payload 数据库适配器 → drizzle-kit → 历史 esbuild-kit → esbuild 0.18.20，涉及 esbuild 开发服务器的跨站读取。仓库启动脚本使用 Next.js，不启动该开发服务器；数据库迁移工具依赖中仍保留该包。未跨主版本强制替换这项迁移工具依赖，避免未经数据库验证改变迁移行为；后续应随上游升级移除。

这一判断来自依赖路径和本仓库的启动方式，不是已完成利用测试。不要将开发服务器暴露到不可信网络。修复后审计统计为 0 critical、0 high、1 moderate、0 low。
