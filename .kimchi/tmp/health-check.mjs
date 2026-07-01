import { validateEnvironment } from "../../lib/system/environmentValidator.mjs";
const result = await validateEnvironment();
console.log(JSON.stringify(result));