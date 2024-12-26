/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// Sesameの状態を取得する関数
async function getSesameStatus(uuid, apiKey) {
	const response = await fetch(`https://app.candyhouse.co/api/sesame2/${uuid}`, {
	  headers: {
		'x-api-key': apiKey
	  }
	});
	return await response.json();
  }

  // LINEにメッセージを送信する関数
  async function sendLineMessage(message, accessToken, userId) {
	const response = await fetch('https://api.line.me/v2/bot/message/push', {
	  method: 'POST',
	  headers: {
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${accessToken}`
	  },
	  body: JSON.stringify({
		to: userId,
		messages: [
		  {
			type: 'text',
			text: message
		  }
		]
	  })
	});
	return response;
  }

  export default {
	async fetch(request, env, ctx) {
	  // faviconリクエストは即座に404
	  if (request.url.endsWith('/favicon.ico')) {
		return new Response(null, { status: 404 });
	  }

	  // メソッドチェック（POST）
	  if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
		  status: 405,
		  headers: { 'Content-Type': 'application/json' }
		});
	  }

	  // 認証ヘッダーチェック（必須）
	  if (!request.headers.has('X-API-KEY')) {
		return new Response(JSON.stringify({ error: 'API Key Required' }), {
		  status: 401,
		  headers: { 'Content-Type': 'application/json' }
		});
	  }

	  // 認証ヘッダーの値チェック
	  const authHeader = request.headers.get('X-API-KEY');
	  if (authHeader !== env.SESAMI_LINE_NOTIFY_ACCESS_TOKEN) {
		return new Response(JSON.stringify({ error: 'Invalid API Key' }), {
		  status: 401,
		  headers: { 'Content-Type': 'application/json' }
		});
	  }

	  // 認証済みの場合のみ、以下の処理を実行
	  try {
		const devices = JSON.parse(env.SESAME_DEVICES);
		let statusMessages = [];

		for (const [key, device] of Object.entries(devices)) {
		  const status = await getSesameStatus(device.uuid, env.SESAME_API_KEY);
		  const deviceMessage = `${device.name}の状態:\n施錠: ${status.CHSesame2Status === 'locked' ? '🔒 locked' : '🔓 unlocked'}\nバッテリー: ${status.batteryPercentage}%`;
		  statusMessages.push(deviceMessage);
		}

		const finalMessage = "Sesameのステータス\n\n" + statusMessages.join("\n\n");
		await sendLineMessage(finalMessage, env.LINE_ACCESS_TOKEN, env.LINE_USER_ID);

		return new Response(JSON.stringify({
		  status: "送信完了",
		  message: finalMessage
		}, null, 2), {
		  headers: { 'Content-Type': 'application/json' }
		});
	  } catch (error) {
		return new Response(JSON.stringify({ error: error.message }), {
		  status: 500,
		  headers: { 'Content-Type': 'application/json' }
		});
	  }
	},

	// 定期実行される処理
	async scheduled(event, env, ctx) {
	  try {
		const devices = JSON.parse(env.SESAME_DEVICES);
		let statusMessages = [];

		for (const [key, device] of Object.entries(devices)) {
		  const status = await getSesameStatus(device.uuid, env.SESAME_API_KEY);
		  const deviceMessage = `${device.name}の状態:\n施錠: ${status.CHSesame2Status === 'locked' ? '🔒 locked' : '🔓 unlocked'}\nバッテリー: ${status.batteryPercentage}%`;
		  statusMessages.push(deviceMessage);
		}

		const finalMessage = "Sesame状態レポート\n\n" + statusMessages.join("\n\n");
		await sendLineMessage(finalMessage, env.LINE_ACCESS_TOKEN, env.LINE_USER_ID);
	  } catch (error) {
		console.error('Error:', error);
		// エラー時もLINEに通知
		await sendLineMessage('Sesame状態の取得中にエラーが発生しました。', env.LINE_ACCESS_TOKEN, env.LINE_USER_ID);
	  }
	}
  };
