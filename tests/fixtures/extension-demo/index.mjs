import { appendFile } from "node:fs/promises";

if (process.env.CHISEL_DEMO_IMPORTS)
  await appendFile(process.env.CHISEL_DEMO_IMPORTS, "import\n");
export default async ({ sdk, manifest }) => {
  const settings = await sdk.settings.read();
  const text = () => {
    const message = settings.loud
      ? String(settings.message).toUpperCase()
      : settings.message;
    return (
      Array(Number(settings.count)).fill(message).join(" · ") +
      (settings.style === "long" ? ` (${manifest.version})` : "")
    );
  };
  const tool = sdk.defineTool({
    name: "message",
    description: "Читает README и показывает сохранённые параметры",
    effect: "read",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    prepare: (ctx) => ctx.plan.readText("README.md"),
    execute: async (ctx) => {
      const result = await ctx.effects.run();
      return { ...result, output: `${text()}\n${result.output}` };
    },
  });
  return {
    id: manifest.id,
    version: manifest.version,
    apiVersion: 1,
    entry: manifest.entry,
    activate(ctx) {
      ctx.tools.register(tool);
      ctx.commands.register({
        name: "demo-settings",
        description: "Проверить настройки примера",
        parse: (args) => args,
        execute: (command) =>
          command.tools.execute(`ext:${manifest.id}:message`, {}),
      });
    },
  };
};
