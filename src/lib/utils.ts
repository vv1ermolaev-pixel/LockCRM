import { createCn } from "cn/config";

// cn() must know the custom tokens from src/app/tokens.css: without this list
// it reads `text-17` as a color and drops it next to `text-ink`
export const cn = createCn({
  extend: {
    theme: {
      text: [
        "title",
        "title-lg",
        "name",
        "name-lg",
        "heading",
        "heading-lg",
        "lead",
        "logo",
        "logo-lg",
        "13",
        "15",
        "17",
      ],
      radius: ["6", "10", "12", "14", "16", "18", "28", "32"],
    },
  },
});
