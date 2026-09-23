// `--name value` off `process.argv`. Every entrypoint here takes its inputs this way, because the
// workflow that calls it already has them as strings and a parser is a dependency this does not need.
export const arg = (name: string, argv = process.argv): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
