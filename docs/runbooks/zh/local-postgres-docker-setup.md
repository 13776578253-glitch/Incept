# 本地 PostgreSQL Docker 搭建

## 目标

在 Docker Desktop 中运行 PostgreSQL，同时继续把应用代码保留在原生 Windows 环境。

这与当前推荐工作流一致：

- 代码保留在 `D:\...`
- Git 保留在 Windows
- Next.js 运行在 Windows
- PostgreSQL 运行在 Docker 内
- 应用通过 `localhost` 连接数据库

在这个方案里，**不需要**把仓库迁进 WSL 文件系统。

---

## 已添加文件

- 根目录 `docker-compose.yml`
- 根目录 `.env.docker.example`
- `apps/web/.env.example`
- `packages/db/.env.example`

---

## 首次配置

### 1. 创建 Docker 环境变量文件

在仓库根目录执行：

```powershell
Copy-Item .env.docker.example .env.docker
```

当前可以先保留默认值。

### 2. 创建应用环境变量文件

在 `apps/web` 中执行：

```powershell
Copy-Item .env.example .env.local
```

它会提供：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/incept?schema=public"
```

### 3. 创建 Prisma 环境变量文件

在 `packages/db` 中执行：

```powershell
Copy-Item .env.example .env
```

这样 Prisma CLI 也会拿到同一条数据库连接串。

### 4. 启动 PostgreSQL

在仓库根目录执行：

```powershell
docker compose --env-file .env.docker up -d
```

### 5. 验证容器状态正常

```powershell
docker compose ps
```

你应该能看到 `postgres` 服务处于运行状态。

---

## 常用命令

### 启动数据库

```powershell
docker compose --env-file .env.docker up -d
```

### 停止数据库

```powershell
docker compose --env-file .env.docker down
```

### 停止数据库并删除本地数据

```powershell
docker compose --env-file .env.docker down -v
```

`-v` 要谨慎使用，因为它会删除命名的 PostgreSQL volume。

### 查看日志

```powershell
docker compose logs postgres
```

---

## 连接模型

应用会按下面方式连接：

- host: `localhost`
- port: `5432`
- database: `incept`
- username: `postgres`
- password: `postgres`

因此应用侧连接串是：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/incept?schema=public"
```

---

## 为什么这个方案适合当前仓库

这是一个不错的第一步，因为：

- 它保留了你当前的 Windows 编辑工作流
- Git 使用方式无需变化
- PostgreSQL 被隔离出来，且容易重置
- 后续 Prisma 可以直接接入，而不用改变前端路由结构

---

## 数据库启动后的下一步

当 PostgreSQL 正常启动后，下一步应当是：

1. 创建 `packages/db`
2. 加入 Prisma
3. 编写 `schema.prisma`
4. 跑第一版 migration
5. seed docs 数据

这才是正式开始数据库集成的正确节点。
