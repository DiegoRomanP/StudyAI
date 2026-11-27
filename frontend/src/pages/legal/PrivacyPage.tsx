import { LegalDocument } from "./LegalDocument";

const PROCESSORS = [
  { name: "Supabase", purpose: "Cuentas, inicio de sesión y base de datos", place: "EE. UU." },
  { name: "Cloudflare", purpose: "Alojamiento de la web y almacenamiento de tus documentos", place: "Global (EE. UU. y otros)" },
  { name: "Amazon Web Services (AWS)", purpose: "Servidor que procesa tus documentos y planes", place: "Brasil (São Paulo)" },
  { name: "Resend", purpose: "Envío de correos (confirmación de cuenta y recuperación de contraseña)", place: "EE. UU." },
  { name: "Mercado Pago", purpose: "Procesamiento de pagos (Yape y tarjeta)", place: "Perú y otros países de la región" },
  { name: "Anthropic (Claude)", purpose: "Inteligencia artificial que lee tu material y genera planes y tests", place: "EE. UU." },
];

export function PrivacyPage() {
  return (
    <LegalDocument title="Política de privacidad">
      <section>
        <h2>1. Responsable</h2>
        <p>
          El responsable del tratamiento de tus datos es <strong>[titular y RUC pendientes]</strong>, conforme a la Ley N.º 29733, Ley
          de Protección de Datos Personales, y su reglamento. Contacto: <strong>[correo de contacto pendiente]</strong>.
        </p>
      </section>
      <section>
        <h2>2. Qué datos recogemos</h2>
        <ul>
          <li>Datos de cuenta: correo electrónico y, si entras con Google, tu nombre e identificador de Google.</li>
          <li>Material de estudio: los documentos que subes y el texto que extraemos de ellos.</li>
          <li>Uso del servicio: metas, planes, respuestas a los tests, progreso y movimientos de créditos.</li>
          <li>Compras: producto, importe, estado y fecha. Los datos de tu tarjeta los trata Mercado Pago, no nosotros.</li>
          <li>Datos técnicos mínimos para la seguridad: dirección IP y registros de errores.</li>
        </ul>
      </section>
      <section>
        <h2>3. Para qué los usamos</h2>
        <ul>
          <li>Prestarte el servicio: generar tus planes, tests y repasos.</li>
          <li>Gestionar tu cuenta, tus créditos y tus pagos, y emitir comprobantes.</li>
          <li>Proteger el servicio frente a abusos y resolver fallos.</li>
          <li>Atender tus consultas, reclamos y solicitudes de derechos.</li>
        </ul>
        <p>No vendemos tus datos ni los usamos para publicidad. No usamos tu material para entrenar modelos de IA.</p>
      </section>
      <section>
        <h2>4. Con quién los compartimos (encargados)</h2>
        <p>Usamos estos proveedores, que tratan tus datos solo por encargo nuestro y para los fines indicados:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-text-primary">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4 font-semibold">Proveedor</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Para qué</th>
                <th scope="col" className="py-2 font-semibold">Dónde</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name} className="border-b border-line">
                  <td className="py-2 pr-4 text-text-primary">{p.name}</td>
                  <td className="py-2 pr-4">{p.purpose}</td>
                  <td className="py-2">{p.place}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>5. Transferencia internacional</h2>
        <p>
          Para generar tus planes, el texto de tu material se envía a <strong>Anthropic, que lo procesa en Estados Unidos</strong>.
          Varios de los proveedores anteriores también tratan datos fuera del Perú. Al usar el servicio consientes estas
          transferencias, que se hacen con proveedores que ofrecen garantías adecuadas de protección.
        </p>
      </section>
      <section>
        <h2>6. Cuánto tiempo los guardamos</h2>
        <p>
          Guardamos tus datos mientras tengas la cuenta. Si la eliminas, borramos tu material y tus planes en un plazo de 30 días,
          salvo los datos de compras, que conservamos el tiempo que exige la normativa tributaria.
        </p>
      </section>
      <section>
        <h2>7. Tus derechos (ARCO)</h2>
        <p>
          Puedes pedir acceso, rectificación, cancelación u oposición al tratamiento de tus datos escribiendo a{" "}
          <strong>[correo de contacto pendiente]</strong>. Responderemos en los plazos de la Ley 29733. Si no estás conforme, puedes
          acudir a la Autoridad Nacional de Protección de Datos Personales.
        </p>
      </section>
      <section>
        <h2>8. Seguridad</h2>
        <p>
          Usamos conexiones cifradas, almacenamiento privado y acceso restringido. Ningún sistema es infalible: si ocurre un
          incidente que afecte tus datos, te lo comunicaremos.
        </p>
      </section>
    </LegalDocument>
  );
}
