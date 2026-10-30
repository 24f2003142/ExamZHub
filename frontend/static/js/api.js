const EZ = { C: {} };

EZ.state = Vue.reactive({
  user: JSON.parse(localStorage.getItem('ez_user') || 'null'),
  token: localStorage.getItem('ez_token'),
  toasts: [],
  view: null,
  unread: 0,
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
});

EZ.page = (name, definition) => {
  EZ.C[name] = Object.assign({ props: ['params'] }, definition);
};

EZ.setAuth = (token, user) => {
  EZ.state.token = token;
  EZ.state.user = user;
  localStorage.setItem('ez_token', token);
  localStorage.setItem('ez_user', JSON.stringify(user));
};

EZ.logout = () => {
  EZ.state.token = null;
  EZ.state.user = null;
  EZ.state.unread = 0;
  localStorage.removeItem('ez_token');
  localStorage.removeItem('ez_user');
};

EZ.home = role => ({ admin: '#/admin', examiner: '#/examiner', student: '#/student' })[role] || '#/login';
EZ.go = hash => {
  if (location.hash === hash) EZ.resolve();
  else location.hash = hash;
};

EZ.toast = (message, type = 'success') => {
  const toast = { id: Date.now() + Math.random(), message, type };
  EZ.state.toasts.push(toast);
  setTimeout(() => {
    EZ.state.toasts = EZ.state.toasts.filter(item => item.id !== toast.id);
  }, 3500);
};

EZ.api = async (method, path, body, raw = false) => {
  const headers = {};
  if (body != null) headers['Content-Type'] = 'application/json';
  if (EZ.state.token) headers.Authorization = `Bearer ${EZ.state.token}`;
  let response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new Error('Cannot reach the server');
  }
  if (raw && response.ok) return response;
  let data = {};
  try { data = await response.json(); } catch (_) { /* empty response */ }
  if (response.status === 401 && EZ.state.token) {
    EZ.logout();
    EZ.go('#/login');
    throw new Error(data.error || 'Session expired. Please log in again.');
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};

EZ.run = async (operation, successMessage) => {
  try {
    const result = await operation();
    if (successMessage) EZ.toast(successMessage);
    return result;
  } catch (error) {
    EZ.toast(error.message, 'danger');
  }
};

EZ.download = async (path, filename) => {
  const response = await EZ.api('GET', path, null, true);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
};

EZ.fmt = value => value ? new Date(value).toLocaleString() : '-';
EZ.localInput = value => value ? value.slice(0, 16) : '';
EZ.badge = status => ({
  Draft: 'secondary', 'Slot Creation': 'info', 'Booking Open': 'success', Closed: 'warning',
  Completed: 'dark', Available: 'success', Full: 'danger', Cancelled: 'secondary',
  Booked: 'primary', Pending: 'warning', Submitted: 'success', Active: 'success', Inactive: 'secondary',
}[status] || 'secondary');

EZ.C['ez-nav'] = {
  computed: {
    state() { return EZ.state; },
    viewKey() { return EZ.state.view && EZ.state.view.key; },
    links() {
      return ({
        admin: [['Dashboard', '/admin'], ['Courses', '/admin/courses'], ['Exams', '/admin/exams'], ['People', '/admin/people'], ['Departments', '/admin/departments'], ['Slots & Bookings', '/admin/bookings'], ['Logout', '#logout']],
        examiner: [['Dashboard', '/examiner'], ['My Slots', '/examiner/slots'], ['Booked Students', '/examiner/bookings'], ['Logout', '#logout']],
        student: [['Dashboard', '/student'], ['Exams', '/student/exams'], ['My Bookings', '/student/bookings'], ['Notifications', '/student/notifications'], ['Profile', '/student/profile'], ['Logout', '#logout']],
      })[EZ.state.user.role] || [];
    },
  },
  watch: { viewKey() { EZ.state.mobileSidebarOpen = false; this.refreshUnread(); } },
  mounted() { this.refreshUnread(); },
  methods: {
    active(path) { return EZ.state.view && EZ.state.view.key === path; },
    navigate(link) {
      if (link[1] === '#logout') this.logout();
      else EZ.go('#' + link[1]);
    },
    toggleDesktop() { EZ.state.sidebarCollapsed = !EZ.state.sidebarCollapsed; },
    toggleMobile() {
      if (window.innerWidth < 768) EZ.state.sidebarCollapsed = false;
      EZ.state.mobileSidebarOpen = !EZ.state.mobileSidebarOpen;
    },
    async refreshUnread() {
      if (EZ.state.user.role !== 'student') return;
      try { EZ.state.unread = (await EZ.api('GET', '/student/notifications')).unread; } catch (_) { /* navbar remains usable */ }
    },
    logout() { EZ.logout(); EZ.go('#/login'); },
  },
  template: `
  <div class="sidebar-frame">
    <button class="sidebar-mobile-toggle" type="button" aria-label="Open navigation" @click="toggleMobile"><span class="sidebar-menu-icon" aria-hidden="true"></span></button>
    <button v-if="state.mobileSidebarOpen" class="sidebar-scrim" type="button" aria-label="Close navigation" @click="toggleMobile"></button>
    <aside class="ez-sidebar" :class="{ 'is-collapsed': state.sidebarCollapsed, 'is-open': state.mobileSidebarOpen }">
      <div class="sidebar-heading">
        <a class="sidebar-brand" href="#/" :title="state.sidebarCollapsed ? 'ExamZHub' : ''"><span v-if="state.sidebarCollapsed" class="brand-mark">Z</span><span v-else>Exam<span>Z</span>Hub</span></a>
        <button class="sidebar-collapse-button" type="button" :aria-label="state.sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'" :title="state.sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'" @click="toggleDesktop"><span>{{ state.sidebarCollapsed ? '+' : '−' }}</span></button>
      </div>
      <div class="sidebar-section-label" v-if="!state.sidebarCollapsed">Workspace</div>
      <nav class="sidebar-links" aria-label="Main navigation">
        <a v-for="link in links" :key="link[1]" class="sidebar-link" :class="{ 'is-active': link[1] !== '#logout' && active(link[1]), 'sidebar-logout-link': link[1] === '#logout' }" :href="link[1] === '#logout' ? undefined : '#' + link[1]" :role="link[1] === '#logout' ? 'button' : undefined" :title="state.sidebarCollapsed ? link[0] : ''" @click.prevent="navigate(link)">
          <span class="sidebar-link-label" v-if="!state.sidebarCollapsed">{{ link[0] }}</span>
          <span v-if="link[1] === '/student/notifications' && state.unread" class="sidebar-unread" :class="{ 'is-dot': state.sidebarCollapsed }">{{ state.sidebarCollapsed ? '' : state.unread }}</span>
        </a>
      </nav>
    </aside>
  </div>`,
};

EZ.C['exam-form'] = {
  props: ['exam', 'courses', 'departments'],
  emits: ['saved', 'cancel'],
  data() {
    const exam = this.exam || {};
    return { form: {
      id: exam.id,
      course_id: exam.course_id || '',
      department_id: exam.department_id || '',
      year: exam.year || '',
      semester: exam.semester || '',
      name: exam.name || '',
      exam_type: exam.exam_type || 'Viva',
      duration: exam.duration || 15,
      max_marks: exam.max_marks || 50,
      slot_creation_start: EZ.localInput(exam.slot_creation_start),
      slot_creation_end: EZ.localInput(exam.slot_creation_end),
      booking_start: EZ.localInput(exam.booking_start),
      booking_end: EZ.localInput(exam.booking_end),
      instructions: exam.instructions || '',
    } };
  },
  methods: {
    async save() {
      const payload = { ...this.form };
      ['slot_creation_start', 'slot_creation_end', 'booking_start', 'booking_end'].forEach(key => { payload[key] = payload[key] || null; });
      const result = await EZ.run(() => payload.id
        ? EZ.api('PUT', '/admin/exams/' + payload.id, payload)
        : EZ.api('POST', '/admin/exams', payload), 'Exam saved');
      if (result) this.$emit('saved', result.exam);
    },
  },
  template: `
  <form class="row g-2" @submit.prevent="save">
    <div class="col-md-4"><label class="form-label small">Course</label><select class="form-select" v-model.number="form.course_id" required><option value="" disabled>Select course</option><option v-for="course in courses" :key="course.id" :value="course.id">{{ course.code }} - {{ course.name }}</option></select></div>
    <div class="col-md-4"><label class="form-label small">Exam name</label><input class="form-control" v-model="form.name" required maxlength="150"></div>
    <div class="col-md-4"><label class="form-label small">Type</label><select class="form-select" v-model="form.exam_type"><option>Viva</option><option>Practical</option><option>Project Demo</option><option>Assessment</option></select></div>
    <div class="col-md-4"><label class="form-label small">Department</label><select class="form-select" v-model.number="form.department_id" required><option value="" disabled>Select department</option><option v-for="department in departments" :key="department.id" :value="department.id">{{ department.code }} - {{ department.name }}</option></select></div>
    <div class="col-md-2"><label class="form-label small">Year</label><select class="form-select" v-model.number="form.year" required><option value="" disabled>Year</option><option v-for="value in 6" :key="value" :value="value">Year {{ value }}</option></select></div>
    <div class="col-md-2"><label class="form-label small">Semester</label><select class="form-select" v-model.number="form.semester" required><option value="" disabled>Semester</option><option v-for="value in 12" :key="value" :value="value">Semester {{ value }}</option></select></div>
    <div class="col-md-3"><label class="form-label small">Duration (min)</label><input class="form-control" type="number" min="1" v-model.number="form.duration" required></div>
    <div class="col-md-3"><label class="form-label small">Max marks</label><input class="form-control" type="number" min="1" v-model.number="form.max_marks" required></div>
    <div class="col-md-3"><label class="form-label small">Slot creation start</label><input class="form-control" type="datetime-local" v-model="form.slot_creation_start"></div>
    <div class="col-md-3"><label class="form-label small">Slot creation end</label><input class="form-control" type="datetime-local" v-model="form.slot_creation_end"></div>
    <div class="col-md-3"><label class="form-label small">Booking start</label><input class="form-control" type="datetime-local" v-model="form.booking_start"></div>
    <div class="col-md-3"><label class="form-label small">Booking end</label><input class="form-control" type="datetime-local" v-model="form.booking_end"></div>
    <div class="col-md-6"><label class="form-label small">Instructions</label><textarea class="form-control" rows="2" v-model="form.instructions"></textarea></div>
    <div class="col-12"><button class="btn btn-success me-2">Save</button><button type="button" class="btn btn-light" @click="$emit('cancel')">Cancel</button></div>
  </form>`,
};
