// Vite `?raw` imports (used by tests to load fixtures; workerd has no `fs`).
declare module "*.ics?raw" {
  const content: string;
  export default content;
}
