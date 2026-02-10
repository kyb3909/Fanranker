/**
 * n8n Code 노드: gameSlip.do GET 응답에서 Set-Cookie 헤더 추출
 *
 * ■ 이전 노드: HTTP Request (GET gameSlip.do, Full Response 옵션 ON)
 * ■ 출력: { cookies: "JSESSIONID=xxx; PCID=yyy; ..." }
 */
var resp = $input.first().json;
var headers = resp.headers || {};

// set-cookie 헤더 찾기 (대소문자 무관)
var setCookies = null;
for (var key in headers) {
  if (headers.hasOwnProperty(key) && key.toLowerCase() === 'set-cookie') {
    setCookies = headers[key];
    break;
  }
}

if (!setCookies) {
  var allKeys = [];
  for (var k in headers) {
    if (headers.hasOwnProperty(k)) allKeys.push(k);
  }
  return [{ json: { cookies: '', _debug: 'set-cookie 없음. header keys: ' + allKeys.join(', ') } }];
}

// 문자열이면 배열로
if (typeof setCookies === 'string') setCookies = [setCookies];

// 각 Set-Cookie에서 name=value 부분만 추출 (세미콜론 앞)
var parts = [];
for (var i = 0; i < setCookies.length; i++) {
  var nv = setCookies[i].split(';')[0].trim();
  if (nv) parts.push(nv);
}

var cookieStr = parts.join('; ');

return [{ json: { cookies: cookieStr } }];
