# 第三方组件说明

本项目的 Apache-2.0 许可覆盖仓库原创代码与文档，不替代第三方许可证。完整安装依赖的声明清单见 [dependency-licenses.json](docs/dependency-licenses.json)，由锁文件对应的本次安装生成，不包含本机路径。它是许可证声明清单，不是法律兼容性认证。当前运行依赖包中随附的许可证原文已汇总到 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)，部分包未随 npm 包附带独立许可证文件，需在发行相应二进制前核对上游。

## 直接运行依赖

| 组件                         | 版本     | 声明许可证   |
| ---------------------------- | -------- | ------------ |
| @aws-sdk/client-s3           | 3.1117.0 | Apache-2.0   |
| @payloadcms/db-postgres      | 3.89.0   | MIT          |
| @payloadcms/next             | 3.89.0   | MIT          |
| @payloadcms/richtext-lexical | 3.89.0   | MIT          |
| @payloadcms/ui               | 3.89.0   | MIT          |
| cross-env                    | 7.0.3    | MIT          |
| dotenv                       | 16.4.7   | BSD-2-Clause |
| graphql                      | 16.14.2  | MIT          |
| next                         | 16.3.5   | MIT          |
| payload                      | 3.89.0   | MIT          |
| react                        | 19.2.6   | MIT          |
| react-dom                    | 19.2.6   | MIT          |
| sharp                        | 0.35.4   | Apache-2.0   |
| zod                          | 4.4.3    | MIT          |

运行时还使用 Node.js、PostgreSQL 及其随附组件；容器镜像包含操作系统软件。发行二进制、镜像或修改版时，须检查实际随附内容，保留对应许可证与版权声明。

可选 MinIO 服务与 mc 工具使用 GNU AGPLv3，作为独立容器服务运行；它们的许可义务不因本仓库使用 Apache-2.0 而消失。需按各自许可证评估使用和修改后的分发/网络服务义务；上游说明见 [MinIO](https://github.com/minio/minio/blob/master/LICENSE) 和 [mc](https://github.com/minio/mc/blob/master/LICENSE)。源码快速试用只启动 PostgreSQL，媒体使用本地目录。

实际上传的照片、文字、标识和成员资料属于运营内容，不随源码包分发，也不自动按 Apache-2.0 授权。上传者应确认自己拥有相应使用与展示权利。
