// 鉴权端口（music ports/auth 同形）：单一门禁；包不感知会话模型、角色名与同源策略。
export type AuthorizeOwner<TRequest = unknown> = (request: TRequest) => Promise<boolean>;
