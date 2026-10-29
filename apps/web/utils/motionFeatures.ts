// Feature bundle cho LazyMotion — file riêng để Rollup tách thành async chunk,
// chỉ được fetch khi LazyMotion mount (App preload ngay lúc module-eval).
export { domAnimation } from 'motion/react';
