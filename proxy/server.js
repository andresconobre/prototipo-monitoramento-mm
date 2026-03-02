import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

if (!process.env.SOAP_URL) {
  console.warn("[proxy] SOAP_URL nao definido. Configure a variavel de ambiente para consultas funcionarem.");
}

if (!process.env.MAPAS_USER || !process.env.MAPAS_PASS) {
  console.warn("[proxy] MAPAS_USER e/ou MAPAS_PASS nao definidos. Configure as variaveis de ambiente.");
}

app.use(helmet());
app.use(express.json({ limit: "200kb" }));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) return callback(null, true);
      return callback(new Error("Origin nao permitida"));
    },
  })
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: "Origin nao permitida" });
  }
  return next();
});

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisicoes. Tente novamente em instantes." },
  })
);

const buildSoapRequest = ({ placa, dataInicio, dataFim }) => `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <recebePosicoesPlaca xmlns="urn:wsPosicoes">
      <usuario_mapas xsi:type="xsd:string">${process.env.MAPAS_USER || ""}</usuario_mapas>
      <senha_mapas xsi:type="xsd:string">${process.env.MAPAS_PASS || ""}</senha_mapas>
      <data_inicio xsi:type="xsd:string">${dataInicio}</data_inicio>
      <data_fim xsi:type="xsd:string">${dataFim}</data_fim>
      <rotulo xsi:type="xsd:string">${placa}</rotulo>
    </recebePosicoesPlaca>
  </soap:Body>
</soap:Envelope>`;

app.post("/api/posicoes", async (req, res) => {
  const { placa, dataInicio, dataFim } = req.body || {};

  if (!placa || !dataInicio || !dataFim) {
    return res.status(400).json({ error: "Body invalido. Informe placa, dataInicio e dataFim." });
  }

  if (!process.env.SOAP_URL) {
    return res.status(500).json({ error: "SOAP_URL nao configurado no servidor." });
  }

  const soapBody = buildSoapRequest({ placa, dataInicio, dataFim });

  try {
    const soapResponse = await fetch(process.env.SOAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "urn:wsPosicoes#recebePosicoesPlaca",
      },
      body: soapBody,
    });

    const xmlText = await soapResponse.text();
    return res
      .status(soapResponse.status)
      .set("Content-Type", "text/xml; charset=utf-8")
      .send(xmlText);
  } catch (error) {
    return res.status(502).json({ error: "Falha ao consultar SOAP.", details: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[proxy] listening on 0.0.0.0:${PORT}`);
});
