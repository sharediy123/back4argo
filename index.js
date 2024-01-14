const os = require('os');
const http = require('http');
const { Buffer } = require('buffer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const net = require('net');
const { exec, execSync } = require('child_process');
const { WebSocket, createWebSocketStream } = require('ws');
const logcb = (...args) => console.log.bind(this, ...args);
const errcb = (...args) => console.error.bind(this, ...args);
const UUID = process.env.UUID || 'de04add9-5c68-6bab-950c-08cd5320df33';
const uuid = UUID.replace(/-/g, "");
const projectPageURL = process.env.URL || '';// 填写项目域名可自动访问,例如：https://www.google.com
const intervalInMilliseconds = process.env.TIME || 2 * 60 * 1000;  // 自动访问间隔时间（2分钟）
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nz.abc.com';
const NEZHA_PORT = process.env.NEZHA_PORT || '5555';        // 端口为443时自动开启tls
const NEZHA_KEY = process.env.NEZHA_KEY || '';             // 哪吒三个变量不全不运行
const DOMAIN = process.env.DOMAIN || '1234.abc.com';  //项目域名或已反代的域名，不带前缀，建议填已反代的域名
const NAME = process.env.NAME || 'ABCD';
const port = process.env.PORT || 3000;

//获取服务器ISP
const metaInfo = execSync(
  'curl -s https://speed.cloudflare.com/meta | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'',
  { encoding: 'utf-8' }
);
const ISP = metaInfo.trim();
// 创建HTTP路由
const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello, World\n');
  } else if (req.url === '/sub') {
    const vlessURL = `vless://${UUID}@skk.moe:443?encryption=none&security=tls&sni=${DOMAIN}&type=ws&host=${DOMAIN}&path=%2F#${NAME}-${ISP}`;
    
    const base64Content = Buffer.from(vlessURL).toString('base64');

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(base64Content + '\n');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\n');
  }
});

httpServer.listen(port, () => {
  console.log(`HTTP Server is running on port ${port}`);
});

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的ne-zha
function downloadFile(fileName, fileUrl, callback) {
  const filePath = path.join("./", fileName);
  const writer = fs.createWriteStream(filePath);
  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);
      writer.on('finish', function() {
        writer.close();
        callback(null, fileName);
      });
    })
    .catch(error => {
      callback(`Download ${fileName} failed: ${error.message}`);
    });
}

function downloadFiles() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  let downloadedCount = 0;

  filesToDownload.forEach(fileInfo => {
    downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fileName) => {
      if (err) {
        console.log(`Download ${fileName} failed`);
      } else {
        console.log(`Download ${fileName} successfully`);

        downloadedCount++;

        if (downloadedCount === filesToDownload.length) {
          setTimeout(() => {
            authorizeFiles();
          }, 3000);
        }
      }
    });
  });
}

function getFilesForArchitecture(architecture) {
  if (architecture === 'arm') {
    return [
      { fileName: "swith", fileUrl: "https://github.com/eoovve/test/releases/download/ARM/swith" },
    ];
  } else if (architecture === 'amd') {
    return [
      { fileName: "swith", fileUrl: "https://github.com/eoovve/test/releases/download/bulid/swith" },
    ];
  }
  return [];
}

// 授权并运行ne-zha
function authorizeFiles() {
  const filePath = './swith';
  const newPermissions = 0o775;
  fs.chmod(filePath, newPermissions, (err) => {
    if (err) {
      console.error(`Empowerment failed:${err}`);
    } else {
      console.log(`Empowerment success:${newPermissions.toString(8)} (${newPermissions.toString(10)})`);

      // 运行ne-zha
      let NEZHA_TLS = '';
      if (NEZHA_SERVER && NEZHA_PORT && NEZHA_KEY) {
        if (NEZHA_PORT === '443') {
          NEZHA_TLS = '--tls';
        } else {
          NEZHA_TLS = '';
        }
        const command = `./swith -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} >/dev/null 2>&1 &`;
        try {
          exec(command);
          console.log('swith is running');
        } catch (error) {
          console.error(`swith running error: ${error}`);
        }
      } else {
        console.log('NEZHA variable is empty,skip running');
      }
    }
  });
}
downloadFiles();

// 创建WS服务器
const wss = new WebSocket.Server({ server: httpServer });
wss.on('connection', ws => {
  console.log("Connected successfully");
  ws.once('message', msg => {
    const [VERSION] = msg;
    const id = msg.slice(1, 17);
    if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;
    let i = msg.slice(17, 18).readUInt8() + 19;
    const port = msg.slice(i, i += 2).readUInt16BE(0);
    const ATYP = msg.slice(i, i += 1).readUInt8();
    const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
      (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
        (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));
    logcb('Connect:', host, port);
    ws.send(new Uint8Array([VERSION, 0]));
    const duplex = createWebSocketStream(ws);
    net.connect({ host, port }, function() {
      this.write(msg.slice(i));
      duplex.on('error', errcb('E1:')).pipe(this).on('error', errcb('E2:')).pipe(duplex);
    }).on('error', errcb('Connect-Err:', { host, port }));
  }).on('error', errcb('WebSocket Error:'));
});

// 自动访问项目URL
let hasLoggedEmptyMessage = false;
async function visitProjectPage() {
  try {
    // 如果URL和TIME变量都不为空时访问项目URL
    if (!projectPageURL || !intervalInMilliseconds) {
      if (!hasLoggedEmptyMessage) {
        console.log('URL or TIME variable is empty. Skipping visit URL');
        hasLoggedEmptyMessage = true;
      }
      return;
    } else {
      hasLoggedEmptyMessage = false;
    }

    await axios.get(projectPageURL);
    // console.log(`Visiting project page: ${projectPageURL}`);
    console.log('Page visited successfully.');
  } catch (error) {
    console.error('Error visiting project page:', error.message);
  }
}
setInterval(visitProjectPage, intervalInMilliseconds);