// 鉴权端口：单一门禁函数（决策 6）；music 不感知会话模型、角色名、同源策略
// 纯层不引 DOM：请求类型由装配侧参数化（AuthorizeOwner<Request>），包内以泛型占位，零抑制
export type AuthorizeOwner<TRequest = unknown> = (request: TRequest) => Promise<boolean>;
