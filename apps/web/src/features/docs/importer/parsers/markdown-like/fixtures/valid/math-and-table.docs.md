---
locale: zh
slug: math-and-table-fixture
title: 公式与表格
summary: 公式和表格的写作与导入样例
---

# 公式与表格

其中 $a_1+b_2$ 是行内公式，`$x$` 是行内代码。价格从 $5 到 $10。
$$
\begin{aligned}
P&=\frac{TP}{TP+FP}\\
&=\frac{3}{3+2}
\end{aligned}
\tag{M0-01}
$$

## 令 $P$ 为精确率

> 对照 $P=0.6$

- 普通列表项
- 当 $TP=3$ 时

| 公式 | 结果 | 说明 |
| :--- | ---: | :---: |
| $P(A|B)$ | $0.6$ | [M0-01](#eq-m0-01) |
| $a\|b$ | `a|b` | 左\|右 |
| $x_1+x_2$ | | 空单元格 |
$$
x^2
$$

```text
$$
$literal$
| code | stays |
```
