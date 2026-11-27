import { Link } from "react-router-dom";

import { LegalDocument } from "./LegalDocument";

const LINK = "font-semibold text-action hover:text-action-hover";

export function TermsPage() {
  return (
    <LegalDocument title="Términos y condiciones">
      <section>
        <h2>1. Quiénes somos</h2>
        <p>
          StudyAI (studyinflow.app) es un servicio en línea que genera planes de estudio con inteligencia artificial a partir del
          material que subes. Lo presta <strong>[titular y RUC pendientes]</strong>, con domicilio en Perú. Para cualquier consulta
          escríbenos a <strong>[correo de contacto pendiente]</strong>.
        </p>
      </section>
      <section>
        <h2>2. Cuenta y edad mínima</h2>
        <p>
          Necesitas una cuenta con un correo válido y tener al menos 14 años; si eres menor de 18, usa el servicio con autorización
          de tu madre, padre o tutor. Eres responsable de mantener segura tu contraseña y de lo que se haga desde tu cuenta.
        </p>
      </section>
      <section>
        <h2>3. Créditos</h2>
        <ul>
          <li>Un crédito permite generar un plan de estudio nuevo o un repaso con IA de una sesión.</li>
          <li>Subir material, crear metas, rendir tests y reanudar un plan que falló no gastan créditos.</li>
          <li>Si una generación falla por causas del servicio, el crédito se devuelve automáticamente.</li>
          <li>Los créditos comprados en paquetes no vencen. Los créditos del pase mensual duran el periodo del pase y no se acumulan.</li>
          <li>Los créditos no son dinero, no se transfieren entre cuentas ni se canjean por efectivo.</li>
        </ul>
      </section>
      <section>
        <h2>4. Precios y pagos</h2>
        <p>
          Los precios se muestran en soles (PEN) con IGV incluido en la página de <Link to="/precios" className={LINK}>precios</Link>{" "}
          antes de pagar. Los pagos se procesan a través de Mercado Pago (Yape o tarjeta); StudyAI no recibe ni guarda los datos de tu
          tarjeta. Emitimos el comprobante de pago electrónico que corresponda.
        </p>
      </section>
      <section>
        <h2>5. Devoluciones</h2>
        <p>
          Puedes pedir la devolución del dinero de los créditos <strong>no usados</strong> dentro de los 7 días siguientes a la compra.
          El pase mensual se devuelve en proporción a los créditos del pase que no hayas usado. La devolución se hace por el mismo
          medio de pago.
        </p>
      </section>
      <section>
        <h2>6. Tu material</h2>
        <p>
          Los documentos que subes siguen siendo tuyos. Nos das permiso para procesarlos solo para prestarte el servicio (extraer el
          texto, generar tu plan y tus tests). Debes tener derecho a usar ese material; no subas contenido ajeno protegido sin
          autorización ni datos personales de terceros.
        </p>
      </section>
      <section>
        <h2>7. Uso aceptable</h2>
        <ul>
          <li>No intentes acceder a cuentas ajenas, saltarte los límites del servicio ni automatizar el uso de forma abusiva.</li>
          <li>No uses el servicio para contenido ilegal, que incite al odio o que vulnere derechos de otras personas.</li>
          <li>Podemos suspender una cuenta que incumpla estas reglas, avisándote del motivo.</li>
        </ul>
      </section>
      <section>
        <h2>8. Contenido generado por IA</h2>
        <p>
          Los planes, resúmenes y preguntas se generan automáticamente y pueden contener errores. Úsalos como apoyo al estudio y
          contrástalos con tu material y tus docentes; no garantizamos un resultado en ningún examen.
        </p>
      </section>
      <section>
        <h2>9. Disponibilidad y cambios</h2>
        <p>
          Trabajamos para que el servicio esté disponible, pero puede haber interrupciones por mantenimiento o fallos de terceros.
          Si cambiamos estos términos te avisaremos por correo o en la app antes de que entren en vigor.
        </p>
      </section>
      <section>
        <h2>10. Reclamos y ley aplicable</h2>
        <p>
          Estos términos se rigen por las leyes del Perú, incluido el Código de Protección y Defensa del Consumidor. Puedes presentar
          un reclamo o una queja en nuestro <Link to="/reclamaciones" className={LINK}>Libro de Reclamaciones</Link>. El tratamiento de
          tus datos se explica en la <Link to="/privacidad" className={LINK}>política de privacidad</Link>.
        </p>
      </section>
    </LegalDocument>
  );
}
