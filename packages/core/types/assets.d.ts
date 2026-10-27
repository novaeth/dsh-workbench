declare module '*.css?raw' {
  const text: string;
  export default text;
}

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css' {
  const text: string;
  export default text;
}
