import express from 'express';
import cors from 'cors';
import https from 'https';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.text({ type: ['text/xml', 'application/xml'] }));
app.use(express.raw({ type: 'text/xml' }));

app.post('/api/posicoes', (req, res) => {
  const soapRequest = typeof req.body === 'string' ? req.body : req.body.toString();
  
  console.log('📤 Enviando requisição SOAP...');
  console.log('Body completo:\n', soapRequest);

  const options = {
    hostname: 'seguro.linkmonitoramento.com.br',
    port: 443,
    path: '/monitoramento/servicos/api/posicoes/index.php', // Caminho correto do WSDL
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(soapRequest),
      'SOAPAction': 'urn:wsPosicoes#recebePosicoes', // SOAPAction correto do WSDL
      'User-Agent': 'Mozilla/5.0'
    },
    rejectUnauthorized: false
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let data = '';

    console.log('📥 Resposta recebida:', proxyRes.statusCode);

    proxyRes.on('data', (chunk) => {
      data += chunk;
    });

    proxyRes.on('end', () => {
      console.log('✅ Dados completos recebidos');
      console.log('Resposta completa:\n', data);
      
      res.set('Content-Type', 'text/xml; charset=utf-8');
      res.status(proxyRes.statusCode).send(data);
    });
  });

  proxyReq.on('error', (error) => {
    console.error('❌ Erro na requisição:', error);
    res.status(500).json({ 
      error: 'Erro ao conectar com o servidor',
      details: error.message 
    });
  });

  proxyReq.write(soapRequest);
  proxyReq.end();
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy SOAP rodando em http://localhost:${PORT}`);
  console.log(`📍 Endpoint: http://localhost:${PORT}/api/posicoes`);
});
