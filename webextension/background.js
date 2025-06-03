chrome.contextMenus.create({
  id: "yourls",
  title: "Shorten URL",
  contexts: ["all"]
});

// content scriptで選択テキストを取得する関数
function getSelectionTextInTab(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.getSelection ? window.getSelection().toString() : ''
  }).then(results => results[0]?.result || '');
}

// content scriptでリンクターゲットを取得する関数
function getLinkTargetInTab(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const el = document.activeElement;
      return (el && el.tagName && el.tagName.toLowerCase() === 'a' && el.href) ? el.href : '';
    }
  }).then(results => results[0]?.result || '');
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "yourls") {
    // manifest v3では service worker から popup を直接開けないため、
    // 必要に応じてメッセージ送信やUI設計の見直しが必要
    // chrome.action.openPopup() はサポートされていません
    // ここでは何もしない、または通知を出す等の対応が必要
    // chrome.action.openPopup(); // ← v3非対応
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.method === "shortenLink") {
    chrome.storage.local.get().then(settings => {
      const options = {
        action: 'shorturl',
        format: 'simple',
        url: request.url,
        signature: settings.signature
      };
      if (request.keyword) options.keyword = request.keyword;
      YOURLS(settings, options).then(result => sendResponse(result), error => sendResponse(error));
    });
    return true;
  } else if (request.method === "getSelectionInTab" || request.method === "getSelection") {
    getSelectionTextInTab(sender.tab.id).then(selection => sendResponse({ selection }));
    return true;
  } else if (request.method === "getLinkTarget") {
    getLinkTargetInTab(sender.tab.id).then(linkTarget => sendResponse({ linkTarget }));
    return true;
  } else if (request.method === "version") {
    const settings = request.settings;
    YOURLS(settings, { action: 'version', signature: settings.signature }, '^.*<version>(\\d+\\.\\d+.*)<\\/version>.*$')
      .then(result => {
        chrome.storage.local.set(settings);
        sendResponse(result);
      }, error => sendResponse(error));
    return true;
  }
  return false;
});

function YOURLS(settings, options, expected) {
	
	var stripHtml = function (str) {
		var div = document.createElement("div");
		div.innerHTML = str;
		return div.textContent || div.innerText || "";
	}
	
	var expMatchString = expected || '^\\s*(\\S+)\\s*$';
	
	
	apiURLwSlash = settings.api;
	if (apiURLwSlash.substr(-1) != '/')
		apiURLwSlash += '/';
	var apiURL = apiURLwSlash + 'yourls-api.php';
	
	
	
	var qParams = '';
	for (var k in options) {
		if (options.hasOwnProperty(k)) {
			if (qParams.length) qParams += '&';
			qParams += k + '=' + encodeURIComponent(options[k]);
		}
	}
	return new Promise((resolve, reject) => {
		var xhr = new XMLHttpRequest();
		var rqTimer = setTimeout(
			function() {
				xhr.abort();
				reject({error: 'Request timed out'});
			}, (parseInt(settings.maxwait) || 5) * 1000
		);
		
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4) {
				clearTimeout(rqTimer);
				if ((xhr.status == 200) || (xhr.status == 201)) {
					var uMatch = xhr.responseText.match(new RegExp(expMatchString, 'm'));
					if (uMatch) {
						resolve ({url: uMatch[1], originalRespons: xhr.responseText});
					} else {
						reject ({
							error: 'Invalid response from Server: ' + stripHtml (xhr.responseText),
							supp: {
								text: "Are you using an outdated YOURLS version?",
								links: []
							}
						});
					}
				} else {
					var err = {
						error: "Error: Server returned status " + xhr.status + " (" + stripHtml (xhr.statusText) + ")",
						supp: {
							text: "",
							links: []
						}
					};
					
					switch (xhr.status)
					{
						case 403:
							err.supp.text = "Seems like you are not allowed to access the API. Did you provide a correct signature? Please verify at " + apiURLwSlash + "admin/tools.php and double check the signature token in the extension's settings.";
							err.supp.links.push (apiURLwSlash + "admin/tools.php");
							err.supp.links.push ("extension's settings");
							break;
							
						case 404:
							err.supp.text = "Seems like we cannot find an YOURLS API at " + apiURL + "? Did you provide the correct Server URL? Please verify your settings. You should be able to access the admin interface at " + apiURLwSlash + "admin!? Do not append 'yourls-api.php' as we will do that! Double check the Server URL token in the extension's settings.";
							err.supp.links.push (apiURLwSlash + "admin");
							err.supp.links.push (apiURL);
							err.supp.links.push ("extension's settings");
							break;
							
						case 400:
							err.supp.text = "Is that a proper URL? YOURLS won't shorten URLs such as 'about:addons' etc. If you think this is an error please report the issue at https://github.com/binfalse/YOURLS-FirefoxExtension/issues and explain what you did.";
							err.supp.links.push ("https://github.com/binfalse/YOURLS-FirefoxExtension/issues");
							break;
							
						case 0:
							err.supp.text = "Experienced a general connection issue... Maybe your SSL certificate is not valid? Your server is down? You provided an illegal Server URL? Please verify your extension's settings and make sure that you can access the admin interface at " + apiURLwSlash + "admin. If you need further help open a new ticket at https://github.com/binfalse/YOURLS-FirefoxExtension/issues and explain what you did.";
							err.supp.links.push (apiURLwSlash + "admin");
							err.supp.links.push ("https://github.com/binfalse/YOURLS-FirefoxExtension/issues");
							err.supp.links.push ("extension's settings");
							break;
					}
					
					reject (err);
				}
			}
		};
		
		xhr.open('POST', apiURL, true);
		xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
		xhr.send(qParams);
	});
}






