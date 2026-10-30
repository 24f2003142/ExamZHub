EZ.page('page-admin-dashboard', {
  data: () => ({ stats: {}, exams: [], query: '', results: null }),
  async mounted() {
    const [stats, exams] = await Promise.all([
      EZ.run(() => EZ.api('GET', '/admin/stats')),
      EZ.run(() => EZ.api('GET', '/admin/exams')),
    ]);
    if (stats) this.stats = stats;
    if (exams) this.exams = exams.exams;
  },
  computed: {
    statusCounts() {
      const statuses = ['Draft', 'Slot Creation', 'Booking Open', 'Closed', 'Completed'];
      return statuses.map(status => ({
        status,
        count: this.exams.filter(exam => exam.status === status).length,
      }));
    },
    statusMax() { return Math.max(1, ...this.statusCounts.map(item => item.count)); },
    totalExams() { return this.exams.length; },
  },
  methods: {
    async search() {
      const data = await EZ.run(() => EZ.api('GET', '/admin/search?q=' + encodeURIComponent(this.query)));
      if (data) this.results = data;
    },
    queue(kind) { EZ.run(() => EZ.api('POST', '/admin/jobs/' + kind, {}), 'Job queued'); },
  },
  template: `
  <div class="dashboard-page admin-dashboard">
    <header class="dashboard-heading"><div><p class="dashboard-eyebrow">Your workspace</p><h1>Good morning, Admin</h1><p class="dashboard-subtitle">Here's what is happening with your exams today.</p></div><a href="#/admin/exams" class="btn btn-primary">See all exams</a></header>
    <section class="metric-grid" aria-label="Portal totals">
      <article class="metric-card metric-blue"><span class="metric-icon">S</span><div><p>Total students</p><strong>{{ stats.students ?? '—' }}</strong></div></article>
      <article class="metric-card metric-sky"><span class="metric-icon">C</span><div><p>Total courses</p><strong>{{ stats.courses ?? '—' }}</strong></div></article>
      <article class="metric-card metric-cyan"><span class="metric-icon">E</span><div><p>Total exams</p><strong>{{ stats.exams ?? '—' }}</strong></div></article>
      <article class="metric-card metric-indigo"><span class="metric-icon">B</span><div><p>Total bookings</p><strong>{{ stats.bookings ?? '—' }}</strong></div></article>
    </section>
    <section class="dashboard-panel exam-analytics">
      <div class="panel-heading"><div><p class="dashboard-eyebrow">At a glance</p><h2>How your exams are doing</h2></div><span class="panel-total">{{ totalExams }} exams</span></div>
      <div class="exam-chart" role="img" :aria-label="'Exam status distribution across ' + totalExams + ' exams'">
        <div class="chart-grid"><span v-for="n in 5" :key="n"></span></div>
        <div class="chart-columns"><div class="chart-column" v-for="item in statusCounts" :key="item.status"><div class="chart-value">{{ item.count }}</div><div class="chart-track"><div class="chart-bar" :class="'bar-' + item.status.toLowerCase().replaceAll(' ', '-')" :style="{ height: item.count ? Math.max(8, item.count / statusMax * 100) + '%' : '3px' }"></div></div><div class="chart-label">{{ item.status }}</div></div></div>
      </div>
      <div class="chart-legend"><span v-for="item in statusCounts" :key="item.status"><i :class="'bar-' + item.status.toLowerCase().replaceAll(' ', '-')"></i>{{ item.status }} <b>{{ item.count }}</b></span></div>
    </section>
    <admin-charts></admin-charts>
    <div class="dashboard-tools">
      <section class="dashboard-panel search-panel"><div class="panel-heading"><div><p class="dashboard-eyebrow">Need a hand?</p><h2>Find something</h2></div></div><form class="input-group" @submit.prevent="search"><input class="form-control" v-model="query" placeholder="Search students, examiners, exams, bookings" required><button class="btn btn-primary">Search</button></form>
        <div v-if="results" class="search-results mt-3"><section v-for="(rows, key) in results" :key="key" class="mb-3"><h6 class="text-capitalize">{{ key }} ({{ rows.length }})</h6><ul class="list-group"><li class="list-group-item" v-for="row in rows" :key="row.id">{{ row.name || (row.student + ' / ' + row.exam) }} <span class="text-muted small ms-2">{{ row.email || row.status }}</span></li></ul></section></div>
      </section>
      <section class="dashboard-panel jobs-panel"><div class="panel-heading"><div><p class="dashboard-eyebrow">A little admin help</p><h2>Keep things moving</h2></div></div><p class="text-muted">Keep students in the loop or send the monthly summary.</p><div class="job-actions"><button class="btn btn-outline-primary" @click="queue('daily-reminders')">Send reminders</button><button class="btn btn-outline-primary" @click="queue('monthly-report')">Send monthly report</button></div></section>
    </div>
  </div>`,
});

EZ.C['admin-charts'] = {
  data: () => ({ charts: Vue.markRaw([]), ready: false }),
  async mounted() {
    const data = await EZ.run(() => EZ.api('GET', '/admin/analytics'));
    if (!data) return;
    this.ready = true;
    await this.$nextTick();
    const base = { responsive: true, maintainAspectRatio: false };
    const createChart = (ref, config) => this.charts.push(new Chart(this.$refs[ref], config));
    createChart('popular', {
      type: 'bar',
      data: { labels: data.popular.map(item => item.name), datasets: [{ label: 'Bookings', data: data.popular.map(item => item.bookings), backgroundColor: '#1769c2' }] },
      options: { ...base, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
    createChart('workload', {
      type: 'bar',
      data: {
        labels: data.workload.map(item => item.name),
        datasets: [
          { label: 'Slots', data: data.workload.map(item => item.slots), backgroundColor: '#55a2e8' },
          { label: 'Bookings', data: data.workload.map(item => item.bookings), backgroundColor: '#198c83' },
        ],
      },
      options: { ...base, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
    createChart('trend', {
      type: 'line',
      data: { labels: data.trend.labels.map(day => day.slice(5)), datasets: [{ label: 'Bookings per day', data: data.trend.values, borderColor: '#df7a24', backgroundColor: 'rgba(223,122,36,.15)', fill: true, tension: 0.3 }] },
      options: { ...base, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  },
  beforeUnmount() { this.charts.forEach(chart => chart.destroy()); },
  template: `
  <div class="row g-3 mb-4" v-show="ready">
    <div class="col-lg-6"><div class="card shadow-sm"><div class="card-body"><h6>Popular examinations</h6><div style="height:260px"><canvas ref="popular"></canvas></div></div></div></div>
    <div class="col-lg-6"><div class="card shadow-sm"><div class="card-body"><h6>Examiner workload</h6><div style="height:260px"><canvas ref="workload"></canvas></div></div></div></div>
    <div class="col-12"><div class="card shadow-sm"><div class="card-body"><h6>Booking trend (last 30 days)</h6><div style="height:240px"><canvas ref="trend"></canvas></div></div></div></div>
  </div>`,
};

EZ.page('page-admin-courses', {
  data: () => ({ rows: [], form: null, query: '' }),
  mounted() { this.load(); },
  methods: {
    async load() { const data = await EZ.run(() => EZ.api('GET', '/admin/courses?q=' + encodeURIComponent(this.query))); if (data) this.rows = data.courses; },
    add() { this.form = { code: '', name: '', description: '', status: 'Active' }; },
    edit(course) { this.form = { ...course }; },
    async save() {
      const form = this.form;
      const data = await EZ.run(() => form.id ? EZ.api('PUT', '/admin/courses/' + form.id, form) : EZ.api('POST', '/admin/courses', form), 'Course saved');
      if (data) { this.form = null; this.load(); }
    },
    async remove(course) {
      if (!confirm(`Delete course ${course.code}?`)) return;
      const result = await EZ.run(() => EZ.api('DELETE', '/admin/courses/' + course.id), 'Deleted');
      if (result) this.load();
    },
  },
  template: `
  <div><div class="d-flex justify-content-between mb-3"><h3>Courses</h3><button class="btn btn-primary" @click="add">+ New course</button></div>
    <form class="input-group mb-3" @submit.prevent="load"><input class="form-control" v-model="query" placeholder="Search code or name"><button class="btn btn-outline-secondary">Search</button></form>
    <div class="card shadow-sm mb-3" v-if="form"><div class="card-body"><form @submit.prevent="save" class="row g-2">
      <div class="col-md-3"><input class="form-control" v-model="form.code" placeholder="Code" required maxlength="20"></div><div class="col-md-5"><input class="form-control" v-model="form.name" placeholder="Name" required maxlength="150"></div>
      <div class="col-md-2"><select class="form-select" v-model="form.status"><option>Active</option><option>Inactive</option></select></div><div class="col-12"><textarea class="form-control" v-model="form.description" placeholder="Description" rows="2"></textarea></div>
      <div class="col-12"><button class="btn btn-success me-2">Save</button><button type="button" class="btn btn-light" @click="form = null">Cancel</button></div>
    </form></div></div>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Exams</th><th></th></tr></thead><tbody>
      <tr v-for="course in rows" :key="course.id"><td>{{ course.code }}</td><td>{{ course.name }}</td><td><span class="badge" :class="'bg-' + $badge(course.status)">{{ course.status }}</span></td><td>{{ course.exam_count }}</td><td class="text-end"><button class="btn btn-sm btn-outline-primary me-1" @click="edit(course)">Edit</button><button class="btn btn-sm btn-outline-danger" @click="remove(course)">Delete</button></td></tr>
      <tr v-if="!rows.length"><td colspan="5" class="text-center text-muted">No courses</td></tr>
    </tbody></table></div>
  </div>`,
});

EZ.page('page-admin-exams', {
  data: () => ({ rows: [], courses: [], departments: [], query: '', status: '', showForm: false }),
  async mounted() { const [courses, departments] = await Promise.all([EZ.run(() => EZ.api('GET', '/admin/courses')), EZ.run(() => EZ.api('GET', '/admin/departments'))]); if (courses) this.courses = courses.courses.filter(course => course.status === 'Active'); if (departments) this.departments = departments.departments.filter(department => department.is_active); this.load(); },
  methods: {
    async load() {
      const params = new URLSearchParams({ q: this.query, status: this.status });
      const data = await EZ.run(() => EZ.api('GET', '/admin/exams?' + params));
      if (data) this.rows = data.exams;
    },
    created(exam) { EZ.go('#/admin/exams/' + exam.id); },
    async remove(exam) {
      if (!confirm(`Delete exam "${exam.name}"?`)) return;
      const result = await EZ.run(() => EZ.api('DELETE', '/admin/exams/' + exam.id), 'Deleted');
      if (result) this.load();
    },
  },
  template: `
  <div><div class="d-flex justify-content-between mb-3"><h3>Examinations</h3><button class="btn btn-primary" @click="showForm = !showForm">+ New exam</button></div>
    <div class="card shadow-sm mb-3" v-if="showForm"><div class="card-body"><exam-form :courses="courses" :departments="departments" @saved="created" @cancel="showForm = false"></exam-form></div></div>
    <form class="row g-2 mb-3" @submit.prevent="load"><div class="col-md-6"><input class="form-control" v-model="query" placeholder="Search exam name"></div><div class="col-md-3"><select class="form-select" v-model="status" @change="load"><option value="">All statuses</option><option>Draft</option><option>Slot Creation</option><option>Booking Open</option><option>Closed</option><option>Completed</option></select></div><div class="col-md-3"><button class="btn btn-outline-secondary w-100">Search</button></div></form>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Exam</th><th>Course</th><th>Type</th><th>Marks</th><th>Status</th><th></th></tr></thead><tbody>
      <tr v-for="exam in rows" :key="exam.id"><td>{{ exam.name }}</td><td>{{ exam.course_code }}</td><td>{{ exam.exam_type }}</td><td>{{ exam.max_marks }}</td><td><span class="badge" :class="'bg-' + $badge(exam.status)">{{ exam.status }}</span> <span v-if="exam.results_published" class="badge bg-success">Results out</span></td><td class="text-end"><a class="btn btn-sm btn-outline-primary me-1" :href="'#/admin/exams/' + exam.id">Manage</a><button class="btn btn-sm btn-outline-danger" @click="remove(exam)">Delete</button></td></tr>
      <tr v-if="!rows.length"><td colspan="6" class="text-center text-muted">No exams</td></tr>
    </tbody></table></div>
  </div>`,
});

EZ.page('page-admin-exam', {
  data: () => ({ exam: null, courses: [], departments: [], people: [], examinerQuery: '', selected: [], examinerMarks: {}, editing: false, rubricForm: null, results: null }),
  computed: {
    rubricTotal() { return this.exam ? this.exam.rubrics.reduce((total, rubric) => total + rubric.max_marks, 0) : 0; },
    filteredPeople() { const query = this.examinerQuery.trim().toLowerCase(); return query ? this.people.filter(person => (person.name + ' ' + person.email + ' ' + (person.department || '')).toLowerCase().includes(query)) : this.people; },
    actions() {
      const status = this.exam.status;
      return [['open-slots', 'Open slot creation', ['Draft', 'Closed']], ['close-slots', 'Close slot creation', ['Slot Creation']], ['open-booking', 'Open booking', ['Slot Creation', 'Closed']], ['close-booking', 'Close booking', ['Booking Open']], ['complete', 'Mark completed', ['Closed']]].filter(action => action[2].includes(status));
    },
  },
  async mounted() {
    const [courses, examiners, departments] = await Promise.all([EZ.run(() => EZ.api('GET', '/admin/courses')), EZ.run(() => EZ.api('GET', '/admin/examiners')), EZ.run(() => EZ.api('GET', '/admin/departments'))]);
    if (courses) this.courses = courses.courses;
    if (examiners) this.people = examiners.examiners.filter(user => user.is_active);
    if (departments) this.departments = departments.departments.filter(department => department.is_active);
    this.load();
  },
  methods: {
    async load() {
      const data = await EZ.run(() => EZ.api('GET', '/admin/exams/' + this.params.id));
      if (!data) return;
      this.exam = data.exam;
        this.selected = data.exam.examiners.map(user => user.id);
        this.examinerMarks = Object.fromEntries(data.exam.examiners.map(user => [user.id, user.marks_allocated || '']));
      const results = await EZ.run(() => EZ.api('GET', '/admin/exams/' + this.params.id + '/results'));
      if (results) this.results = results;
    },
    async act(action) { const result = await EZ.run(() => EZ.api('POST', '/admin/exams/' + this.exam.id + '/' + action), 'Done'); if (result) this.load(); },
    async saveExaminers() { const allocations = this.selected.map(id => ({ examiner_id: id, max_marks: Number(this.examinerMarks[id]) || null })); const result = await EZ.run(() => EZ.api('PUT', '/admin/exams/' + this.exam.id + '/examiners', { examiner_ids: this.selected, allocations }), 'Examiners updated'); if (result) this.load(); },
    async saveRubric() {
      const form = this.rubricForm;
      const result = await EZ.run(() => form.id ? EZ.api('PUT', '/admin/rubrics/' + form.id, form) : EZ.api('POST', '/admin/exams/' + this.exam.id + '/rubrics', form), 'Rubric saved');
      if (result) { this.rubricForm = null; this.load(); }
    },
    async removeRubric(rubric) {
      if (!confirm(`Delete criterion "${rubric.criterion}"?`)) return;
      const result = await EZ.run(() => EZ.api('DELETE', '/admin/rubrics/' + rubric.id), 'Deleted');
      if (result) this.load();
    },
    async publish(flag) {
      const suffix = flag ? '/publish-results' : '/unpublish-results';
      const result = await EZ.run(() => EZ.api('POST', '/admin/exams/' + this.exam.id + suffix), flag ? 'Results published' : 'Results unpublished');
      if (result) this.load();
    },
  },
  template: `
  <div v-if="exam"><a href="#/admin/exams" class="small">All exams</a>
    <div class="d-flex flex-wrap justify-content-between align-items-center my-2"><h3 class="mb-0">{{ exam.name }} <span class="badge fs-6" :class="'bg-' + $badge(exam.status)">{{ exam.status }}</span> <span v-if="exam.results_published" class="badge fs-6 bg-success">Results published</span></h3><button class="btn btn-outline-primary btn-sm" @click="editing = !editing">Edit details</button></div>
    <p class="text-muted">{{ exam.course_code }} - {{ exam.course }} | {{ exam.exam_type }} | {{ exam.duration }} min | {{ exam.max_marks }} marks</p>
    <div class="card shadow-sm mb-3" v-if="editing"><div class="card-body"><exam-form :exam="exam" :courses="courses" :departments="departments" @saved="editing = false; load()" @cancel="editing = false"></exam-form></div></div>
    <div class="card shadow-sm mb-3"><div class="card-body"><h6>Timeline</h6><div class="row small"><div class="col-md-3">Slot creation: {{ $fmt(exam.slot_creation_start) }} to {{ $fmt(exam.slot_creation_end) }}</div><div class="col-md-3">Booking: {{ $fmt(exam.booking_start) }} to {{ $fmt(exam.booking_end) }}</div></div><div class="mt-3"><button v-for="action in actions" :key="action[0]" class="btn btn-sm btn-primary me-2 mb-1" @click="act(action[0])">{{ action[1] }}</button><span v-if="!actions.length" class="text-muted small">No status actions available.</span></div></div></div>
    <div class="card shadow-sm mb-3"><div class="card-body"><div class="d-flex justify-content-between"><h6>Rubric ({{ rubricTotal }} / {{ exam.max_marks }} marks)</h6><button class="btn btn-sm btn-outline-primary" @click="rubricForm = { criterion: '', max_marks: 10, weightage: 1, description: '' }">+ Criterion</button></div>
      <form v-if="rubricForm" class="row g-2 my-2" @submit.prevent="saveRubric"><div class="col-md-4"><input class="form-control" v-model="rubricForm.criterion" placeholder="Criterion" required></div><div class="col-md-2"><input class="form-control" type="number" step="0.5" min="0.5" v-model.number="rubricForm.max_marks" required></div><div class="col-md-2"><input class="form-control" type="number" step="0.1" min="0.1" v-model.number="rubricForm.weightage" required></div><div class="col-md-4"><input class="form-control" v-model="rubricForm.description" placeholder="Description"></div><div class="col-12"><button class="btn btn-success btn-sm me-2">Save</button><button type="button" class="btn btn-light btn-sm" @click="rubricForm = null">Cancel</button></div></form>
      <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Criterion</th><th>Max</th><th>Weight</th><th>Description</th><th></th></tr></thead><tbody><tr v-for="rubric in exam.rubrics" :key="rubric.id"><td>{{ rubric.criterion }}</td><td>{{ rubric.max_marks }}</td><td>{{ rubric.weightage }}</td><td>{{ rubric.description }}</td><td class="text-end"><button class="btn btn-sm btn-link" @click="rubricForm = { ...rubric }">Edit</button><button class="btn btn-sm btn-link text-danger" @click="removeRubric(rubric)">Delete</button></td></tr><tr v-if="!exam.rubrics.length"><td colspan="5" class="text-muted text-center">No criteria yet</td></tr></tbody></table></div>
    </div></div>
    <div class="card shadow-sm mb-3"><div class="card-body"><h6>Assigned examiners</h6><p class="small text-muted">Split the exam total between examiners. Their evaluations cannot exceed these allocations.</p><input class="form-control form-control-sm mb-2" v-model="examinerQuery" placeholder="Search examiner by name, email, or department"><div class="form-check d-flex align-items-center gap-2 mb-2" v-for="person in filteredPeople" :key="person.id"><input class="form-check-input" type="checkbox" :id="'ex' + person.id" :value="person.id" v-model="selected"><label class="form-check-label flex-grow-1" :for="'ex' + person.id">{{ person.name }} <span class="text-muted small">{{ person.department }}</span></label><input v-if="selected.includes(person.id)" class="form-control form-control-sm" style="max-width:110px" type="number" min="0.5" step="0.5" placeholder="Marks" v-model.number="examinerMarks[person.id]"></div><p v-if="!filteredPeople.length" class="text-muted small">No matching active examiners.</p><button class="btn btn-sm btn-primary mt-2" @click="saveExaminers">Save examiners</button></div></div>
    <div class="card shadow-sm"><div class="card-body" v-if="results"><div class="d-flex justify-content-between"><h6>Evaluations</h6><div><button v-if="!exam.results_published" class="btn btn-sm btn-success" @click="publish(true)">Publish results</button><button v-else class="btn btn-sm btn-outline-warning" @click="publish(false)">Unpublish</button></div></div><div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Student</th><th>Examiner</th><th>Marks</th><th>Remarks</th><th>Status</th></tr></thead><tbody><tr v-for="row in results.results" :key="row.booking_id"><td>{{ row.student }}</td><td>{{ row.examiner }}</td><td>{{ row.total_marks }} / {{ results.max_marks }}</td><td>{{ row.remarks }}</td><td><span class="badge" :class="'bg-' + $badge(row.status)">{{ row.status }}</span></td></tr><tr v-if="!results.results.length"><td colspan="5" class="text-muted text-center">No evaluations yet</td></tr></tbody></table></div></div></div>
  </div>`,
});

EZ.page('page-admin-people', {
  data: () => ({ tab: 'examiners', rows: [], departments: [], query: '', form: null }),
  async mounted() { const data = await EZ.run(() => EZ.api('GET', '/admin/departments')); if (data) this.departments = data.departments.filter(department => department.is_active); this.load(); },
  watch: { tab() { this.query = ''; this.form = null; this.load(); } },
  methods: {
    async load() { const data = await EZ.run(() => EZ.api('GET', '/admin/' + this.tab + '?q=' + encodeURIComponent(this.query))); if (data) this.rows = data[this.tab]; },
    async save() { const result = await EZ.run(() => EZ.api('POST', '/admin/examiners', this.form), 'Examiner added'); if (result) { this.form = null; this.load(); } },
    async toggle(user) { const result = await EZ.run(() => EZ.api('PUT', '/admin/' + this.tab + '/' + user.id, { is_active: !user.is_active }), 'Updated'); if (result) this.load(); },
    async remove(user) { if (!confirm(`Delete ${user.name}?`)) return; const result = await EZ.run(() => EZ.api('DELETE', '/admin/examiners/' + user.id), 'Deleted'); if (result) this.load(); },
  },
  template: `
  <div><h3 class="mb-3">People</h3><div class="people-switch" role="tablist" aria-label="People type"><button class="people-switch-button" :class="{ 'is-active': tab === 'examiners' }" role="tab" :aria-selected="tab === 'examiners'" @click="tab = 'examiners'">Examiners</button><button class="people-switch-button" :class="{ 'is-active': tab === 'students' }" role="tab" :aria-selected="tab === 'students'" @click="tab = 'students'">Students</button><a class="people-switch-button text-decoration-none text-center" href="#/admin/departments">Departments</a></div>
    <div class="d-flex gap-2 mb-3"><form class="input-group" @submit.prevent="load"><input class="form-control" v-model="query" placeholder="Search name or email"><button class="btn btn-outline-secondary">Search</button></form><button v-if="tab === 'examiners'" class="btn btn-primary text-nowrap" @click="form = { name: '', email: '', password: '', department_id: '', phone: '' }">+ Examiner</button></div>
    <div class="card shadow-sm mb-3" v-if="form"><div class="card-body"><form class="row g-2" @submit.prevent="save"><div class="col-md-4"><input class="form-control" v-model="form.name" placeholder="Name" required minlength="2"></div><div class="col-md-4"><input class="form-control" type="email" v-model="form.email" placeholder="Email" required></div><div class="col-md-4"><input class="form-control" type="password" v-model="form.password" placeholder="Password (min 6)" required minlength="6"></div><div class="col-md-4"><select class="form-select" v-model.number="form.department_id" required><option value="" disabled>Department</option><option v-for="department in departments" :key="department.id" :value="department.id">{{ department.code }} - {{ department.name }}</option></select></div><div class="col-md-4"><input class="form-control" v-model="form.phone" placeholder="Phone"></div><div class="col-12"><button class="btn btn-success me-2">Save</button><button type="button" class="btn btn-light" @click="form = null">Cancel</button></div></form></div></div>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Name</th><th>Email</th><th>Department</th><th v-if="tab === 'students'">Year / semester</th><th v-else>Phone</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="user in rows" :key="user.id"><td>{{ user.name }}</td><td>{{ user.email }}</td><td>{{ user.department || '-' }}</td><td v-if="tab === 'students'">{{ user.year ? 'Year ' + user.year + ' / Semester ' + user.semester : '-' }}</td><td v-else>{{ user.phone || '-' }}</td><td><span class="badge" :class="user.is_active ? 'bg-success' : 'bg-secondary'">{{ user.is_active ? 'Active' : 'Disabled' }}</span></td><td class="text-end"><button class="btn btn-sm btn-outline-secondary me-1" @click="toggle(user)">{{ user.is_active ? 'Deactivate' : 'Activate' }}</button><button v-if="tab === 'examiners'" class="btn btn-sm btn-outline-danger" @click="remove(user)">Delete</button></td></tr><tr v-if="!rows.length"><td :colspan="tab === 'students' ? 6 : 6" class="text-center text-muted">Nothing found</td></tr></tbody></table></div>
  </div>`,
});

EZ.page('page-admin-departments', {
  data: () => ({ rows: [], form: null, query: '' }),
  mounted() { this.load(); },
  methods: {
    async load() { const data = await EZ.run(() => EZ.api('GET', '/admin/departments?q=' + encodeURIComponent(this.query))); if (data) this.rows = data.departments; },
    async save() { const result = await EZ.run(() => EZ.api('POST', '/admin/departments', this.form), 'Department saved'); if (result) { this.form = null; this.load(); } },
    async toggle(department) { const result = await EZ.run(() => EZ.api('PUT', '/admin/departments/' + department.id, { is_active: !department.is_active }), 'Department updated'); if (result) this.load(); },
  },
  template: `
  <div><div class="d-flex justify-content-between mb-3"><h3>Departments</h3><button class="btn btn-primary" @click="form = { code: '', name: '' }">+ Add department</button></div>
    <form class="input-group mb-3" @submit.prevent="load"><input class="form-control" v-model="query" placeholder="Search department code or name"><button class="btn btn-outline-secondary">Search</button></form>
    <div class="card shadow-sm mb-3" v-if="form"><div class="card-body"><form class="row g-2" @submit.prevent="save"><div class="col-md-3"><input class="form-control" v-model="form.code" placeholder="Code" required maxlength="20"></div><div class="col-md-6"><input class="form-control" v-model="form.name" placeholder="Department name" required maxlength="120"></div><div class="col-md-3"><button class="btn btn-success me-2">Save</button><button type="button" class="btn btn-light" @click="form = null">Cancel</button></div></form></div></div>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Code</th><th>Name</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="department in rows" :key="department.id"><td>{{ department.code }}</td><td>{{ department.name }}</td><td><span class="badge" :class="department.is_active ? 'bg-success' : 'bg-secondary'">{{ department.is_active ? 'Active' : 'Disabled' }}</span></td><td class="text-end"><button class="btn btn-sm btn-outline-secondary" @click="toggle(department)">{{ department.is_active ? 'Disable' : 'Enable' }}</button></td></tr><tr v-if="!rows.length"><td colspan="4" class="text-center text-muted">No departments yet</td></tr></tbody></table></div>
  </div>`,
});

EZ.page('page-admin-bookings', {
  data: () => ({ tab: 'bookings', exams: [], examiners: [], rows: [], examId: '', status: '', reschedule: null, reassignment: null }),
  computed: { statuses() { return this.tab === 'slots' ? ['Available', 'Full', 'Cancelled', 'Completed'] : ['Booked', 'Cancelled', 'Completed']; } },
  async mounted() {
    const [exams, examiners] = await Promise.all([EZ.run(() => EZ.api('GET', '/admin/exams')), EZ.run(() => EZ.api('GET', '/admin/examiners'))]);
    if (exams) this.exams = exams.exams;
    if (examiners) this.examiners = examiners.examiners.filter(user => user.is_active);
    this.load();
  },
  watch: { tab() { this.status = ''; this.load(); } },
  methods: {
    async load() {
      const params = new URLSearchParams({ exam_id: this.examId, status: this.status });
      const data = await EZ.run(() => EZ.api('GET', '/admin/' + this.tab + '?' + params));
      if (data) this.rows = data[this.tab];
      this.reschedule = null;
      this.reassignment = null;
    },
    async startReschedule(booking) {
      const data = await EZ.run(() => EZ.api('GET', '/admin/slots?exam_id=' + booking.exam_id + '&status=Available'));
      if (data) this.reschedule = { booking, slots: data.slots.filter(slot => slot.id !== booking.slot_id), target: '' };
    },
    async saveReschedule() { const result = await EZ.run(() => EZ.api('POST', '/admin/bookings/' + this.reschedule.booking.id + '/reschedule', { slot_id: this.reschedule.target }), 'Booking rescheduled'); if (result) this.load(); },
    async saveReassignment() { const result = await EZ.run(() => EZ.api('PUT', '/admin/slots/' + this.reassignment.slot.id + '/examiner', { examiner_id: this.reassignment.examinerId }), 'Examiner changed'); if (result) this.load(); },
  },
  template: `
  <div><h3 class="mb-3">Slots &amp; bookings</h3><ul class="nav nav-tabs mb-3"><li class="nav-item"><button class="nav-link" :class="{ active: tab === 'bookings' }" @click="tab = 'bookings'">Bookings</button></li><li class="nav-item"><button class="nav-link" :class="{ active: tab === 'slots' }" @click="tab = 'slots'">Slots</button></li></ul>
    <div class="row g-2 mb-3"><div class="col-md-6"><select class="form-select" v-model="examId" @change="load"><option value="">All exams</option><option v-for="exam in exams" :key="exam.id" :value="exam.id">{{ exam.name }}</option></select></div><div class="col-md-3"><select class="form-select" v-model="status" @change="load"><option value="">All statuses</option><option v-for="value in statuses" :key="value">{{ value }}</option></select></div></div>
    <div class="card shadow-sm mb-3" v-if="reschedule"><div class="card-body"><h6>Reschedule {{ reschedule.booking.student }} ({{ reschedule.booking.exam }})</h6><div class="input-group"><select class="form-select" v-model.number="reschedule.target"><option value="" disabled>Choose new slot</option><option v-for="slot in reschedule.slots" :key="slot.id" :value="slot.id">{{ slot.date }} {{ slot.start_time }}-{{ slot.end_time }} | {{ slot.examiner }} | {{ slot.available_seats }} seat(s)</option></select><button class="btn btn-primary" :disabled="!reschedule.target" @click="saveReschedule">Move</button><button class="btn btn-light" @click="reschedule = null">Cancel</button></div></div></div>
    <div class="table-responsive" v-if="tab === 'bookings'"><table class="table table-hover bg-white align-middle"><thead><tr><th>Student</th><th>Exam</th><th>When</th><th>Examiner</th><th>Status</th><th>Marks</th><th></th></tr></thead><tbody><tr v-for="booking in rows" :key="booking.id"><td>{{ booking.student }}</td><td>{{ booking.exam }}</td><td>{{ booking.date }} {{ booking.start_time }}</td><td>{{ booking.examiner }}</td><td><span class="badge" :class="'bg-' + $badge(booking.status)">{{ booking.status }}</span></td><td>{{ booking.total_marks ?? '-' }}</td><td class="text-end"><button v-if="booking.status === 'Booked'" class="btn btn-sm btn-outline-primary" @click="startReschedule(booking)">Reschedule</button></td></tr><tr v-if="!rows.length"><td colspan="7" class="text-center text-muted">No bookings</td></tr></tbody></table></div>
    <div class="table-responsive" v-else><table class="table table-hover bg-white align-middle"><thead><tr><th>Exam</th><th>Date</th><th>Time</th><th>Examiner</th><th>Booked</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="slot in rows" :key="slot.id"><td>{{ slot.exam }}</td><td>{{ slot.date }}</td><td>{{ slot.start_time }}-{{ slot.end_time }}</td><td>{{ slot.examiner }}</td><td>{{ slot.booked }} / {{ slot.capacity }}</td><td><span class="badge" :class="'bg-' + $badge(slot.status)">{{ slot.status }}</span></td><td class="text-end" style="min-width:260px"><div v-if="reassignment && reassignment.slot.id === slot.id" class="input-group input-group-sm"><select class="form-select" v-model.number="reassignment.examinerId"><option value="" disabled>Examiner</option><option v-for="person in examiners" :key="person.id" :value="person.id">{{ person.name }}</option></select><button class="btn btn-primary" :disabled="!reassignment.examinerId" @click="saveReassignment">Save</button><button class="btn btn-light" @click="reassignment = null">Cancel</button></div><button v-else-if="slot.status !== 'Completed' && slot.status !== 'Cancelled'" class="btn btn-sm btn-outline-primary" @click="reassignment = { slot, examinerId: '' }">Change examiner</button></td></tr><tr v-if="!rows.length"><td colspan="7" class="text-center text-muted">No slots</td></tr></tbody></table></div>
  </div>`,
});
