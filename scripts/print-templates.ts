// Prints every WhatsApp template in the form Meta's template manager asks for.
import { TEMPLATES, TEMPLATE_LANGUAGE } from "../src/lib/whatsapp/templates";

for (const t of Object.values(TEMPLATES)) {
  console.log(`Name:      ${t.metaName}`);
  console.log(`Category:  Utility    Language: ${TEMPLATE_LANGUAGE}`);
  console.log(`Body:      ${t.body}`);
  console.log(`Samples:   ${t.params.map((p, i) => `{{${i + 1}}} = ${p.example}`).join("   ")}`);
  console.log("");
}
console.log("Submit each in WhatsApp Manager > Message templates. Names, language and body must match exactly.");
