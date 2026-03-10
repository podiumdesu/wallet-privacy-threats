const log = require("./logger");

const onWalletTargetCreated = async (
  options,
  requestsFromWallet,
  webSockets,
  cdpClients,
  target
) => {
  // return
  try {
    // const page = await target.page();
    // page.on('request', () => {
    //     print('Page request intercepted');
    // });

    // console.log(page.type())
    // console.log("Handling background page target");

    // Create a CDP session for the background page

    const targetType = target.type(); // "service_worker" or "background_page"
    const url = target.url();

    const backgroundPageClient = await target.createCDPSession();
    // Enable network interception
    await backgroundPageClient.send("Network.enable");
    // 👇 only run Page.enable if NOT a service_worker
    if (targetType !== "service_worker") {
      await backgroundPageClient.send("Page.enable");
    }

    backgroundPageClient.on(
      "Network.responseReceived",
      onResponseReceived.bind(undefined, options, requestsFromWallet)
    );

    backgroundPageClient.on(
      "Network.requestWillBeSent",
      onRequestWillBeSent.bind(undefined, options, requestsFromWallet)
    );

    // For websockets
    backgroundPageClient.on(
      "Network.webSocketCreated",
      onWebSocketCreated.bind(undefined, webSockets, cdpClients)
    );
    backgroundPageClient.on(
      "Network.websocketFrameSent",
      onWebSocketFrameSent.bind(undefined, webSockets, cdpClients)
    );
    backgroundPageClient.on(
      "Network.websocketFrameReceived",
      onWebSocketFrameReceived.bind(undefined, webSockets, cdpClients)
    );

    // Optionally handle other logic related to webSockets or cdpClients here
    // webSockets.push(target);  // Example of storing or managing WebSocket connections
    cdpClients.push(backgroundPageClient); // Example of managing CDP clients

    log.success(
      `Background service; Completed configuring new ${targetType}: ${target.url()}`
    );
  } catch (error) {
    console.error("Error in handling background page target:", error);
  }
};

const onRequestWillBeSent = (options, requestsLog, req) => {
  // console.log(req);

  const requestContext = req.documentURL;
  const requestUrl = req.request.url;
  // const requestType = request.resourceType()[0].toUpperCase() + request.resourceType().substring(1)
  const requestType = req.type;
  const requestMethod = req.request.method;
  const requestHeaders = normalizeHeaders(req.request.headers);

  let requestPostData = req.request.postData;
  if (requestPostData === undefined) {
    requestPostData = "";
  }

  requestInfo = {
    origin: "service worker",
    requestContext: requestContext,
    ts: Date.now(),
    id: req.requestId,
    url: requestUrl,
    type: requestType,
    method: requestMethod,
    headers: requestHeaders,
    postData: requestPostData,
    status: undefined,
    responseHeaders: {},
  };
  // console.log(requestInfo)

  requestsLog.requests.push(requestInfo);
  // console.log(requestsLog)

  let eth_call_name = "";

  if (requestPostData && requestPostData.includes("eth_")) {
    const regex = /"method":"([^"]+)"/;
    const match = requestPostData.match(regex);
    if (match) {
      eth_call_name = match[1];
    } else {
      console.log("No match found");
    }
  }

  const numRequests = requestsLog.requests.length;
  log.lightBlue2e(
    `Request ${numRequests}  (wallet):`,
    `${eth_call_name ? `(${eth_call_name})` : ""} ${requestUrl
      .split("?", 1)
      .toString()
      .split(";", 1)}`
  );
};

const onResponseReceived = (options, requestsLog, res) => {
  // console.log('Response received from service worker:', res.response.url);
  for (let i = 0; i < requestsLog.requests.length; i++) {
    if (requestsLog.requests[i].id === res.requestId) {
      requestsLog.requests[i].status = res.response.status;
      requestsLog.requests[i].responseHeaders = normalizeHeaders(
        res.response.headers
      );
      break;
    }
  }
};

const onWebSocketCreated = (webSockets, cdpClients, params) => {
  webSockets.push(params);
  console.log(`WebSocket created: ${params.requestId}`);
};

const onWebSocketFrameSent = (webSockets, cdpClients, params) => {
  console.log(`WebSocket frame sent: ${params.requestId}`);
};

const onWebSocketFrameReceived = (webSockets, cdpClients, params) => {
  console.log(`WebSocket frame received: ${params.requestId}`);
};

function normalizeHeaders(headers) {
  const normalized = {};
  Object.keys(headers).forEach((name) => {
    normalized[name.toLowerCase().trim()] = headers[name];
  });
  return normalized;
}

module.exports = {
  onWalletTargetCreated,
  normalizeHeaders,
};
