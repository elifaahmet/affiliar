/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./node_modules/react-tailwindcss-datepicker/dist/index.esm.{js,ts}",
  ],
  theme: {
    extend: {
      screens: {
        xxl: "1400px",
      },
      colors: {
        purple: "#7859E9",
        "menu-color": "#CECCE4",
        // Electric violet — neon-leaning primary on a light theme.
        // Keep tokens semantically compatible with the old blue palette
        // so existing classes (text-primary, bg-primary-light, etc.) just
        // re-skin without component-level edits.
        primary: "#8B5CF6",
        "primary-dark": "#6D28D9",
        "primary-medium": "#C4B5FD",
        "primary-light": "#F3EEFF",
        "primary-chip": "#8B5CF61A",
        secondary: "#12B5D1",
        "secondary-dark": "#119DB3",
        "secondary-medium": "#A7CFD5",
        "secondary-light": "#EDFAFC",
        orange: "#FF7B31",
        "orange-dark": "#AE4E18",
        "orange-light": "#FFC5A4",
        success: "#13A846",
        "success-dark": "#129862",
        "success-light": "#18CE571A",
        "success-chip": "#17C6531A",
        danger: "#FF4B55",
        "danger-dark": "#B53434",
        "danger-light": "#FFF1F2",
        "danger-chip": "#FF4B551A",
        warning: "#FF6E1D",
        "warning-active": "#E26620",
        "warning-light": "#F6E7DF",
        yellow: "#FFAD31",
        "yellow-dark": "#C49D0F",
        "yellow-light": "#FFF5D0",
        "yellow-chip": "#F0BA151A",
        white: "#FFFFFF",
        "white-active": "#F5F8FA",
        cyan: "#13C9B3",
        "cyan-dark": "#119DB3",
        dark: "#282A42",
        darkGreen: "#119DB3",
        "secondary-green": "#12B7D1",
        "secondary-light-green": "#EDFAFC",
        "gray-100": "#FCFCFC", //--Bg-light-1
        "gray-200": "#F7F7F9", //--Bg-light-2
        "gray-300": "#F1F1F4", //--Bg-light-3
        "gray-400": "#D4D9E6", //--Bg-light-4
        "gray-500": "#99A1B7", //--Bg-light-5
        "gray-600": "#78829D", //--Bg-dark-1
        "gray-700": "#4B5675", //--Bg-dark-2
        "gray-800": "#1C325E", //--Bg-dark-3
        "gray-900": "#282A42", //--Bg-dark-4
        "chip-bg": "#EDF2FF",
        borderColor: "#CECCE47F",
        borderDarkColor: "#99A1B7",
        grayBg: "#F7F7F9",
        darkBlue: "#185ADB",
        "blue-tab-color": "#2373B1",
        pink: "#DB31D0",
        "pink-chip": "#DB31D01A",
      },
      backgroundImage: {
        "success-gradient": "linear-gradient(225deg, #009C2C 0%, #00691E 100%)",
        "danger-gradient": "linear-gradient(225deg, #F1416C 0%, #C63659 100%)",
        "primary-gradient": "linear-gradient(225deg, #A78BFA 0%, #6D28D9 100%)",
        "purple-gradient": "linear-gradient(225deg, #7859E9 0%, #543EA4 100%)",
        "orange-gradient": "linear-gradient(225deg, #FF7B31 0%, #D66627 100%)",
        "warning-gradient": "linear-gradient(225deg, #FFAD31 0%, #CE8D2A 100%)",
        "cyan-gradient": "linear-gradient(225deg, #13C9B3 0%, #0D8E7E 100%)",
      },
      fontSize: {
        "heading-24": ["24px", "28px"], // font-size 24px, line-height 28px
        "heading-20": ["20px", "24px"], // font-size 20px, line-height 24px
        "heading-18": ["18px", "20px"], // font-size 18px, line-height 20px
        "heading-16": ["16px", "16px"], // font-size 16px, line-height 16px
        "body-reg-14": ["14px", "16px"], // Regular font-size 14px, line-height 16px
        "body-med-14": ["14px", "16px"], // Medium font-size 14px, line-height 16px
        "body-bold-14": ["14px", "16px"], // Bold font-size 14px, line-height 16px
        "body-reg-13": ["13px", "14px"], // Regular font-size 13px, line-height 14px
        "body-med-13": ["13px", "14px"], // Medium font-size 13px, line-height 14px
        "body-bold-13": ["13px", "14px"], // Bold font-size 13px, line-height 14px
        "body-reg-12": ["12px", "14px"], // Regular font-size 12px, line-height 13px
        "body-med-12": ["12px", "14px"], // Medium font-size 12px, line-height 13px
        "body-bold-12": ["12px", "14px"], // Bold font-size 12px, line-height 13px
        "body-reg-10": ["10px", "13px"], // Regular font-size 12px, line-height 13px
      },
      fontWeight: {
        bold: "700",
        medium: "500",
        regular: "400",
      },
      letterSpacing: {
        tightest: "0px", // Harf boşlukları (Spacing)
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.3s ease-out forwards",
      },
    },
  },
  plugins: [],
};
