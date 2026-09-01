import { createSlide, getSlideSpec } from "../slideFactory.mjs";
export async function slide01(presentation, ctx) { return createSlide(presentation, ctx, getSlideSpec(1)); }
