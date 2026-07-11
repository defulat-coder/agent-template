export const defaultEcommerceFixtureDatabaseUrl =
  "postgresql://project_template:project_template@localhost:15432/project_template?schema=ecommerce_fixture";

export function getEcommerceFixtureDatabaseUrl(
  input: Record<string, string | undefined> = process.env,
) {
  const configured =
    input.ECOMMERCE_FIXTURE_DATABASE_URL ??
    input.DATABASE_URL ??
    defaultEcommerceFixtureDatabaseUrl;
  const url = new URL(configured);
  url.searchParams.set("schema", "ecommerce_fixture");
  return url.toString();
}
