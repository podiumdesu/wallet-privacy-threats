// logger.js

// ANSI color codes
const RESET = "\x1b[0m";
const BRIGHT = "\x1b[1m";
const DIM = "\x1b[2m";
const UNDERSCORE = "\x1b[4m";

const FG_RED = "\x1b[31m";
const FG_GREEN = "\x1b[32m";
const FG_YELLOW = "\x1b[33m";
const FG_BLUE = "\x1b[34m";
const FG_MAGENTA = "\x1b[35m";
const FG_CYAN = "\x1b[36m";

// Extended colors using 256-color mode
const FG_PURPLE = "\x1b[38;5;129m"; // Deep purple/magenta
const FG_PINK = "\x1b[38;5;213m"; // Pink
const FG_LIGHT_BLUE = "\x1b[38;5;123m"; // Light blue
const FG_ORANGE = "\x1b[38;5;208m"; // Orange
const FG_GRAY = "\x1b[38;5;244m"; // Gray
const FG_LIGHT_GREEN = "\x1b[38;5;119m"; // Light green

// Logging functions using ANSI codes for coloring
const log = {
  info: (message) => {
    console.log(`${FG_GREEN}%s${RESET}`, message); // Green text for info
  },

  purple: (message) => {
    console.log(`${FG_PURPLE}%s${RESET}`, message);
  },

  pink: (message) => {
    console.log(`${FG_PINK}%s${RESET}`, message);
  },

  pink2e: (...args) => {
    const message = args
      .map((arg, index) => (index === 1 ? `${FG_PINK}${arg}${RESET}` : arg))
      .join(" ");
    console.log(message);
  },
  lightBlue: (message) => {
    console.log(`${FG_LIGHT_BLUE}%s${RESET}`, message);
  },
  lightBlue2e: (...args) => {
    const message = args
      .map((arg, index) =>
        index === 1 ? `${FG_LIGHT_BLUE}${arg}${RESET}` : arg
      )
      .join(" ");
    console.log(message);
  },
  warn: (message) => {
    console.log(`${FG_YELLOW}${BRIGHT}%s${RESET}`, message); // Bright Yellow text for warnings
  },
  error: (message) => {
    console.log(`${FG_RED}${BRIGHT}%s${RESET}`, message); // Bright Red text for errors
  },
  debug: (message) => {
    console.log(`${FG_BLUE}${BRIGHT}%s${RESET}`, message); // Dim Blue text for debug messages
  },
  success: (message) => {
    console.log(`${FG_CYAN}${UNDERSCORE}%s${RESET}`, message); // Underlined Cyan text for success messages
  },
};

// Export the logger
module.exports = log;
