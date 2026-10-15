const ROUTES = [
	['/login', 'page-login', null],
	['/register', 'page-register', null],
	['/admin', 'page-admin-dashboard', 'admin'],
	['/admin/courses', 'page-admin-courses', 'admin'],
	['/admin/exams', 'page-admin-exams', 'admin'],
	['/admin/exams/:id', 'page-admin-exam', 'admin'],
	['/admin/people', 'page-admin-people', 'admin'],
	['/admin/bookings', 'page-admin-bookings', 'admin'],
	['/examiner', 'page-examiner-dashboard', 'examiner'],
	['/examiner/slots', 'page-examiner-slots', 'examiner'],
	['/examiner/bookings', 'page-examiner-bookings', 'examiner'],
	['/examiner/evaluate/:id', 'page-examiner-evaluate', 'examiner'],
	['/student', 'page-student-dashboard', 'student'],
	['/student/exams', 'page-student-exams', 'student'],
	['/student/exams/:id', 'page-student-exam', 'student'],
	['/student/bookings', 'page-student-bookings', 'student'],
	['/student/notifications', 'page-student-notifications', 'student'],
	['/student/profile', 'page-student-profile', 'student'],
];

function matchRoute(path) {
	const segments = path.split('/').filter(Boolean);
	for (const [pattern, component, role] of ROUTES) {
		const expected = pattern.split('/').filter(Boolean);
		if (expected.length !== segments.length) continue;
		const params = {};
		let matches = true;
		expected.forEach((segment, index) => {
			if (segment.startsWith(':')) params[segment.slice(1)] = segments[index];
			else if (segment !== segments[index]) matches = false;
		});
		if (matches) return { component, role, params };
	}
	return null;
}

EZ.resolve = () => {
	const user = EZ.state.user;
	const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
	const route = path === '/' ? null : matchRoute(path);
	if (!route) {
		EZ.go(user ? EZ.home(user.role) : '#/login');
		return;
	}
	if (route.role && !user) {
		EZ.go('#/login');
		return;
	}
	if (route.role && user.role !== route.role) {
		EZ.go(EZ.home(user.role));
		return;
	}
	if (!route.role && user) {
		EZ.go(EZ.home(user.role));
		return;
	}
	EZ.state.view = { component: route.component, params: route.params, key: path };
};

window.addEventListener('hashchange', EZ.resolve);

const app = Vue.createApp({
	computed: { state() { return EZ.state; } },
	template: `
	<div>
		<ez-nav v-if="state.user"></ez-nav>
		<div class="toast-wrap" aria-live="polite" aria-atomic="true">
			<div v-for="toast in state.toasts" :key="toast.id" class="alert shadow-sm py-2 mb-2" :class="'alert-' + toast.type">{{ toast.message }}</div>
		</div>
		<main class="container py-4">
			<component v-if="state.view" :is="state.view.component" :key="state.view.key" :params="state.view.params"></component>
		</main>
	</div>`,
});

Object.entries(EZ.C).forEach(([name, component]) => app.component(name, component));
app.config.globalProperties.$badge = EZ.badge;
app.config.globalProperties.$fmt = EZ.fmt;
app.config.globalProperties.$ez = EZ;
EZ.resolve();
app.mount('#app');
