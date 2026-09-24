// jest-dom 匹配器的类型增强须从 web 自身解析（包侧解析不合并 vitest 模块声明）；其余共享缺口在 @incept/music/testing/setup
import '@testing-library/jest-dom/vitest';
import '@incept/music/testing/setup';
