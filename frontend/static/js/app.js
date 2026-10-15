const { createApp } = Vue;

createApp({
	delimiters: ["[[", "]]"],
	data() {
		return { status: "checking..." };
	},
	async mounted() {
		const response = await fetch("/api/health");
		const data = await response.json();
		this.status = `${data.status} | redis: ${data.redis}`;
	},
}).mount("#app");
