const EZ = { C: {} };

EZ.state = Vue.reactive({
  user: JSON.parse(localStorage.getItem('ez_user') || 'null'),
  token: localStorage.getItem('ez_token'),
  toasts: [],
  view: null,
  unread: 0,
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
  data: () => ({ open: false }),
  computed: {
    state() { return EZ.state; },
    viewKey() { return EZ.state.view && EZ.state.view.key; },
    links() {
      return ({
        admin: [['Dashboard', '/admin'], ['Courses', '/admin/courses'], ['Exams', '/admin/exams'], ['People', '/admin/people'], ['Slots & Bookings', '/admin/bookings']],
        examiner: [['Dashboard', '/examiner'], ['My Slots', '/examiner/slots'], ['Booked Students', '/examiner/bookings']],
        student: [['Dashboard', '/student'], ['Exams', '/student/exams'], ['My Bookings', '/student/bookings'], ['Notifications', '/student/notifications'], ['Profile', '/student/profile']],
      })[EZ.state.user.role] || [];
    },
  },
  watch: { viewKey() { this.open = false; this.refreshUnread(); } },
  mounted() { this.refreshUnread(); },
  methods: {
    active(path) { return EZ.state.view && EZ.state.view.key === path; },
    async refreshUnread() {
      if (EZ.state.user.role !== 'student') return;
      try { EZ.state.unread = (await EZ.api('GET', '/student/notifications')).unread; } catch (_) { /* navbar remains usable */ }
    },
    logout() { EZ.logout(); EZ.go('#/login'); },
  },
  template: `
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
    <div class="container">
      <a class="navbar-brand" href="#/">Exam<b>Z</b>Hub</a>
      <button class="navbar-toggler" type="button" aria-label="Toggle navigation" @click="open = !open"><span class="navbar-toggler-icon"></span></button>
      <div class="collapse navbar-collapse" :class="{ show: open }">
        <ul class="navbar-nav me-auto">
          <li class="nav-item" v-for="link in links" :key="link[1]">
            <a class="nav-link" :class="{ active: active(link[1]) }" :href="'#' + link[1]">{{ link[0] }}
              <span v-if="link[1] === '/student/notifications' && state.unread" class="badge bg-danger ms-1">{{ state.unread }}</span>
            </a>
          </li>
        </ul>
        <span class="navbar-text me-3">{{ state.user.name }} <span class="badge bg-secondary text-capitalize">{{ state.user.role }}</span></span>
        <button class="btn btn-outline-light btn-sm" @click="logout">Logout</button>
      </div>
    </div>
  </nav>`,
};

EZ.C['exam-form'] = {
  props: ['exam', 'courses'],
  emits: ['saved', 'cancel'],
  data() {
    const exam = this.exam || {};
    return { form: {
      id: exam.id,
      course_id: exam.course_id || '',
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
