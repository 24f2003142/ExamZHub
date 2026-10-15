EZ.page('page-student-dashboard', {
  data: () => ({ dashboard: null, exporting: false }),
  async mounted() { const data = await EZ.run(() => EZ.api('GET', '/student/dashboard')); if (data) this.dashboard = data; },
  methods: {
    async exportCsv() {
      this.exporting = true;
      const started = await EZ.run(() => EZ.api('POST', '/student/export'));
      if (!started) { this.exporting = false; return; }
      EZ.toast('Export started. You will be notified when it is ready.', 'info');
      const id = started.job.id;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const status = await EZ.run(() => EZ.api('GET', '/student/export/' + id));
        if (!status) break;
        if (status.job.status === 'Done') {
          await EZ.run(() => EZ.download('/student/export/' + id + '/download', 'examination_history.csv'), 'Export downloaded');
          break;
        }
        if (status.job.status === 'Failed') { EZ.toast(status.job.error || 'Export failed', 'danger'); break; }
      }
      this.exporting = false;
    },
  },
  template: `
  <div v-if="dashboard"><div class="d-flex justify-content-between align-items-center mb-3"><h3 class="mb-0">Hello, {{ $ez.state.user.name }}</h3><button class="btn btn-outline-primary btn-sm" :disabled="exporting" @click="exportCsv">{{ exporting ? 'Preparing CSV...' : 'Export history (CSV)' }}</button></div>
    <div class="row g-3 mb-4"><div class="col-6 col-md-4" v-for="item in [['Available exams','available_exams'],['Available slots','available_slots'],['My booked slots','booked_slots']]" :key="item[1]"><div class="card card-stat text-center shadow-sm"><div class="card-body"><div class="display-6">{{ dashboard[item[1]] }}</div><div class="text-muted small">{{ item[0] }}</div></div></div></div></div>
    <h5>Upcoming examinations</h5><div class="table-responsive mb-4"><table class="table bg-white"><thead><tr><th>Exam</th><th>Date</th><th>Time</th><th>Examiner</th><th>Link</th></tr></thead><tbody><tr v-for="booking in dashboard.upcoming" :key="booking.id"><td>{{ booking.exam }}</td><td>{{ booking.date }}</td><td>{{ booking.start_time }}-{{ booking.end_time }}</td><td>{{ booking.examiner }}</td><td><a v-if="booking.meeting_link" :href="booking.meeting_link" target="_blank" rel="noopener">Join</a></td></tr><tr v-if="!dashboard.upcoming.length"><td colspan="5" class="text-center text-muted">Nothing upcoming. <a href="#/student/exams">Browse exams</a></td></tr></tbody></table></div>
    <h5>Published results</h5><div class="row g-3"><div class="col-md-4" v-for="booking in dashboard.published_results" :key="booking.id"><div class="card shadow-sm"><div class="card-body"><div class="fw-bold">{{ booking.exam }}</div><div class="display-6">{{ booking.result.total_marks }}<small class="fs-6 text-muted"> / {{ booking.result.max_marks }}</small></div><div class="small text-muted">{{ booking.result.remarks }}</div></div></div></div><div v-if="!dashboard.published_results.length" class="col-12 text-muted">No results published yet.</div></div>
  </div>`,
});

EZ.page('page-student-exams', {
  data: () => ({ rows: [], query: '', examType: '', available: false, loaded: false }),
  mounted() { this.load(); },
  methods: {
    async load() {
      const params = new URLSearchParams({ q: this.query, exam_type: this.examType, available: this.available ? '1' : '' });
      const data = await EZ.run(() => EZ.api('GET', '/student/exams?' + params));
      if (data) this.rows = data.exams;
      this.loaded = true;
    },
  },
  template: `
  <div><h3 class="mb-3">Examinations</h3><form class="row g-2 mb-3 align-items-center" @submit.prevent="load"><div class="col-md-5"><input class="form-control" v-model="query" placeholder="Search exam or course"></div><div class="col-md-3"><select class="form-select" v-model="examType" @change="load"><option value="">All types</option><option>Viva</option><option>Practical</option><option>Project Demo</option><option>Assessment</option></select></div><div class="col-md-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="available-filter" v-model="available" @change="load"><label class="form-check-label" for="available-filter">Booking open</label></div></div><div class="col-md-2"><button class="btn btn-outline-secondary w-100">Search</button></div></form>
    <div class="row g-3"><div class="col-md-6 col-lg-4" v-for="exam in rows" :key="exam.id"><div class="card h-100 shadow-sm"><div class="card-body"><h5>{{ exam.name }}</h5><div class="text-muted small mb-2">{{ exam.course_code }} | {{ exam.course }}</div><span class="badge bg-primary me-1">{{ exam.exam_type }}</span><span class="badge" :class="'bg-' + $badge(exam.status)">{{ exam.status }}</span><div class="small mt-2">{{ exam.duration }} min | {{ exam.max_marks }} marks | {{ exam.available_seats }} seat(s) open</div><div class="small text-muted">Booking: {{ $fmt(exam.booking_start) }} to {{ $fmt(exam.booking_end) }}</div></div><div class="card-footer bg-white"><a class="btn btn-sm btn-primary" :href="'#/student/exams/' + exam.id">{{ exam.already_booked ? 'View booking' : 'View & book' }}</a></div></div></div><div v-if="loaded && !rows.length" class="col-12 text-center text-muted">No examinations found.</div></div>
  </div>`,
});

EZ.page('page-student-exam', {
  data: () => ({ exam: null }),
  mounted() { this.load(); },
  methods: {
    async load() { const data = await EZ.run(() => EZ.api('GET', '/student/exams/' + this.params.id)); if (data) this.exam = data.exam; },
    async book(slot) {
      if (!confirm(`Book ${slot.date} ${slot.start_time} with ${slot.examiner}?`)) return;
      const result = await EZ.run(() => EZ.api('POST', '/student/bookings', { slot_id: slot.id }), 'Slot booked successfully');
      if (result) EZ.go('#/student/bookings'); else this.load();
    },
  },
  template: `
  <div v-if="exam"><a href="#/student/exams" class="small">&larr; All exams</a><h3 class="mt-2">{{ exam.name }} <span class="badge fs-6" :class="'bg-' + $badge(exam.status)">{{ exam.status }}</span></h3><p class="text-muted">{{ exam.course_code }} | {{ exam.course }} | {{ exam.exam_type }} | {{ exam.duration }} min | {{ exam.max_marks }} marks</p><div class="row g-3">
    <div class="col-lg-8"><div class="card shadow-sm"><div class="card-body"><h6>Available slots</h6><div v-if="exam.already_booked" class="alert alert-success py-2">You already have a booking for this exam. See <a href="#/student/bookings">My Bookings</a>.</div><div v-else-if="exam.status !== 'Booking Open'" class="alert alert-warning py-2">Booking is not open for this exam.</div><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Date</th><th>Time</th><th>Examiner</th><th>Seats</th><th></th></tr></thead><tbody><tr v-for="slot in exam.slots" :key="slot.id"><td>{{ slot.date }}</td><td>{{ slot.start_time }}-{{ slot.end_time }}</td><td>{{ slot.examiner }}</td><td>{{ slot.available_seats }} / {{ slot.capacity }}</td><td class="text-end"><button class="btn btn-sm btn-primary" :disabled="exam.already_booked || exam.status !== 'Booking Open' || !slot.available_seats" @click="book(slot)">Book</button></td></tr><tr v-if="!exam.slots.length"><td colspan="5" class="text-center text-muted">No slots available</td></tr></tbody></table></div></div></div></div>
    <div class="col-lg-4"><div class="card shadow-sm mb-3"><div class="card-body"><h6>Instructions</h6><p class="mb-0 small">{{ exam.instructions || 'No special instructions.' }}</p></div></div><div class="card shadow-sm"><div class="card-body"><h6>Evaluation criteria</h6><ul class="list-unstyled small mb-0"><li v-for="rubric in exam.rubrics" :key="rubric.criterion">{{ rubric.criterion }} <span class="text-muted">({{ rubric.max_marks }})</span></li></ul></div></div></div>
  </div></div>`,
});

EZ.page('page-student-bookings', {
  data: () => ({ rows: [], status: '', open: null }),
  mounted() { this.load(); },
  methods: {
    async load() { const data = await EZ.run(() => EZ.api('GET', '/student/bookings?status=' + this.status)); if (data) this.rows = data.bookings; },
    async cancel(booking) { if (!confirm(`Cancel booking for ${booking.exam}?`)) return; const result = await EZ.run(() => EZ.api('DELETE', '/student/bookings/' + booking.id), 'Booking cancelled'); if (result) this.load(); },
  },
  template: `
  <div><div class="d-flex justify-content-between mb-3"><h3>My bookings</h3><select class="form-select w-auto" v-model="status" @change="load"><option value="">All</option><option>Booked</option><option>Completed</option><option>Cancelled</option></select></div><div class="table-responsive"><table class="table bg-white align-middle"><thead><tr><th>Exam</th><th>Course</th><th>Date</th><th>Time</th><th>Examiner</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody><template v-for="booking in rows" :key="booking.id"><tr><td>{{ booking.exam }}</td><td>{{ booking.course }}</td><td>{{ booking.date }}</td><td>{{ booking.start_time }}-{{ booking.end_time }}</td><td>{{ booking.examiner }}</td><td><span class="badge" :class="'bg-' + $badge(booking.status)">{{ booking.status }}</span></td><td><a v-if="booking.result" href="javascript:void(0)" @click="open = open === booking.id ? null : booking.id">{{ booking.result.total_marks }} / {{ booking.result.max_marks }}</a><span v-else class="text-muted">-</span></td><td class="text-end"><button v-if="booking.can_cancel" class="btn btn-sm btn-outline-danger" @click="cancel(booking)">Cancel</button></td></tr><tr v-if="open === booking.id && booking.result" class="table-light"><td colspan="8"><b>Examiner feedback:</b> {{ booking.result.remarks || 'No remarks' }}<ul class="mb-0 mt-1 small"><li v-for="score in booking.result.breakdown" :key="score.criterion">{{ score.criterion }}: {{ score.marks }}</li></ul></td></tr></template><tr v-if="!rows.length"><td colspan="8" class="text-center text-muted">No bookings yet</td></tr></tbody></table></div></div>`,
});

EZ.page('page-student-notifications', {
  data: () => ({ rows: [] }),
  mounted() { this.load(); },
  methods: {
    async load() { const data = await EZ.run(() => EZ.api('GET', '/student/notifications')); if (data) { this.rows = data.notifications; EZ.state.unread = data.unread; } },
    async markRead() { const result = await EZ.run(() => EZ.api('POST', '/student/notifications/read', {})); if (result) { EZ.state.unread = 0; this.load(); } },
    download(notification) { EZ.run(() => EZ.download(notification.link.replace(/^\/api/, ''), 'examination_history.csv'), 'Downloaded'); },
  },
  template: `
  <div><div class="d-flex justify-content-between mb-3"><h3>Notifications</h3><button class="btn btn-outline-secondary btn-sm" @click="markRead">Mark all read</button></div><ul class="list-group"><li class="list-group-item d-flex justify-content-between align-items-center" v-for="notification in rows" :key="notification.id" :class="{ 'fw-bold': !notification.is_read }"><span>{{ notification.message }} <small class="text-muted fw-normal ms-2">{{ $fmt(notification.created_at) }}</small></span><button v-if="notification.kind === 'export' && notification.link" class="btn btn-sm btn-outline-primary" @click="download(notification)">Download</button></li><li v-if="!rows.length" class="list-group-item text-center text-muted">No notifications</li></ul></div>`,
});

EZ.page('page-student-profile', {
  data: () => ({ form: null }),
  async mounted() { const data = await EZ.run(() => EZ.api('GET', '/auth/me')); if (data) this.form = { name: data.user.name, email: data.user.email, roll_no: data.user.roll_no || '', phone: data.user.phone || '', password: '' }; },
  methods: {
    async save() { const result = await EZ.run(() => EZ.api('PUT', '/auth/me', this.form), 'Profile updated'); if (result) { EZ.setAuth(EZ.state.token, result.user); this.form.password = ''; } },
  },
  template: `
  <div v-if="form" class="row justify-content-center"><div class="col-md-6"><div class="card shadow-sm"><div class="card-body"><h4>Profile</h4><form @submit.prevent="save"><label class="form-label small">Email</label><input class="form-control mb-2" :value="form.email" disabled><label class="form-label small">Name</label><input class="form-control mb-2" v-model="form.name" required minlength="2"><label class="form-label small">Roll number</label><input class="form-control mb-2" v-model="form.roll_no"><label class="form-label small">Phone</label><input class="form-control mb-2" v-model="form.phone" pattern="[0-9+ -]{7,15}" title="7 to 15 digits"><label class="form-label small">New password (leave blank to keep)</label><input class="form-control mb-3" type="password" v-model="form.password" minlength="6"><button class="btn btn-primary">Save changes</button></form></div></div></div></div>`,
});
