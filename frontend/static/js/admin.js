EZ.page('page-admin-dashboard', {
  data: () => ({ stats: {}, query: '', results: null }),
  async mounted() { const data = await EZ.run(() => EZ.api('GET', '/admin/stats')); if (data) this.stats = data; },
  methods: {
    async search() {
      const data = await EZ.run(() => EZ.api('GET', '/admin/search?q=' + encodeURIComponent(this.query)));
      if (data) this.results = data;
    },
    queue(kind) { EZ.run(() => EZ.api('POST', '/admin/jobs/' + kind, {}), 'Job queued'); },
  },
  template: `
  <div><h3 class="mb-3">Admin dashboard</h3>
    <div class="row g-3 mb-4"><div class="col-6 col-md-4 col-lg-2" v-for="item in [['Courses','courses'],['Exams','exams'],['Students','students'],['Examiners','examiners'],['Slots','slots'],['Bookings','bookings']]" :key="item[1]">
      <div class="card card-stat text-center shadow-sm"><div class="card-body"><div class="display-6">{{ stats[item[1]] ?? '-' }}</div><div class="text-muted small">{{ item[0] }}</div></div></div>
    </div></div>
    <div class="card shadow-sm mb-4"><div class="card-body"><form class="input-group" @submit.prevent="search"><input class="form-control" v-model="query" placeholder="Search students, examiners, exams, bookings" required><button class="btn btn-primary">Search</button></form>
      <div v-if="results" class="mt-3"><section v-for="(rows, key) in results" :key="key" class="mb-3"><h6 class="text-capitalize">{{ key }} ({{ rows.length }})</h6><ul class="list-group"><li class="list-group-item" v-for="row in rows" :key="row.id">{{ row.name || (row.student + ' / ' + row.exam) }} <span class="text-muted small ms-2">{{ row.email || row.status }}</span></li></ul></section></div>
    </div></div>
    <div class="card shadow-sm"><div class="card-body"><h6>Batch jobs</h6><button class="btn btn-outline-primary btn-sm me-2" @click="queue('daily-reminders')">Run daily reminders</button><button class="btn btn-outline-primary btn-sm" @click="queue('monthly-report')">Send monthly report</button></div></div>
  </div>`,
});

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
  data: () => ({ rows: [], courses: [], query: '', status: '', showForm: false }),
  async mounted() { const data = await EZ.run(() => EZ.api('GET', '/admin/courses')); if (data) this.courses = data.courses.filter(course => course.status === 'Active'); this.load(); },
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
    <div class="card shadow-sm mb-3" v-if="showForm"><div class="card-body"><exam-form :courses="courses" @saved="created" @cancel="showForm = false"></exam-form></div></div>
    <form class="row g-2 mb-3" @submit.prevent="load"><div class="col-md-6"><input class="form-control" v-model="query" placeholder="Search exam name"></div><div class="col-md-3"><select class="form-select" v-model="status" @change="load"><option value="">All statuses</option><option>Draft</option><option>Slot Creation</option><option>Booking Open</option><option>Closed</option><option>Completed</option></select></div><div class="col-md-3"><button class="btn btn-outline-secondary w-100">Search</button></div></form>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Exam</th><th>Course</th><th>Type</th><th>Marks</th><th>Status</th><th></th></tr></thead><tbody>
      <tr v-for="exam in rows" :key="exam.id"><td>{{ exam.name }}</td><td>{{ exam.course_code }}</td><td>{{ exam.exam_type }}</td><td>{{ exam.max_marks }}</td><td><span class="badge" :class="'bg-' + $badge(exam.status)">{{ exam.status }}</span> <span v-if="exam.results_published" class="badge bg-success">Results out</span></td><td class="text-end"><a class="btn btn-sm btn-outline-primary me-1" :href="'#/admin/exams/' + exam.id">Manage</a><button class="btn btn-sm btn-outline-danger" @click="remove(exam)">Delete</button></td></tr>
      <tr v-if="!rows.length"><td colspan="6" class="text-center text-muted">No exams</td></tr>
    </tbody></table></div>
  </div>`,
});

EZ.page('page-admin-exam', {
  data: () => ({ exam: null, courses: [], people: [], selected: [], editing: false, rubricForm: null, results: null }),
  computed: {
    rubricTotal() { return this.exam ? this.exam.rubrics.reduce((total, rubric) => total + rubric.max_marks, 0) : 0; },
    actions() {
      const status = this.exam.status;
      return [['open-slots', 'Open slot creation', ['Draft', 'Closed']], ['close-slots', 'Close slot creation', ['Slot Creation']], ['open-booking', 'Open booking', ['Slot Creation', 'Closed']], ['close-booking', 'Close booking', ['Booking Open']], ['complete', 'Mark completed', ['Closed']]].filter(action => action[2].includes(status));
    },
  },
  async mounted() {
    const [courses, examiners] = await Promise.all([EZ.run(() => EZ.api('GET', '/admin/courses')), EZ.run(() => EZ.api('GET', '/admin/examiners'))]);
    if (courses) this.courses = courses.courses;
    if (examiners) this.people = examiners.examiners.filter(user => user.is_active);
    this.load();
  },
  methods: {
    async load() {
      const data = await EZ.run(() => EZ.api('GET', '/admin/exams/' + this.params.id));
      if (!data) return;
      this.exam = data.exam;
      this.selected = data.exam.examiners.map(user => user.id);
      const results = await EZ.run(() => EZ.api('GET', '/admin/exams/' + this.params.id + '/results'));
      if (results) this.results = results;
    },
    async act(action) { const result = await EZ.run(() => EZ.api('POST', '/admin/exams/' + this.exam.id + '/' + action), 'Done'); if (result) this.load(); },
    async saveExaminers() { const result = await EZ.run(() => EZ.api('PUT', '/admin/exams/' + this.exam.id + '/examiners', { examiner_ids: this.selected }), 'Examiners updated'); if (result) this.load(); },
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
  <div v-if="exam"><a href="#/admin/exams" class="small">&larr; All exams</a>
    <div class="d-flex flex-wrap justify-content-between align-items-center my-2"><h3 class="mb-0">{{ exam.name }} <span class="badge fs-6" :class="'bg-' + $badge(exam.status)">{{ exam.status }}</span> <span v-if="exam.results_published" class="badge fs-6 bg-success">Results published</span></h3><button class="btn btn-outline-primary btn-sm" @click="editing = !editing">Edit details</button></div>
    <p class="text-muted">{{ exam.course_code }} - {{ exam.course }} | {{ exam.exam_type }} | {{ exam.duration }} min | {{ exam.max_marks }} marks</p>
    <div class="card shadow-sm mb-3" v-if="editing"><div class="card-body"><exam-form :exam="exam" :courses="courses" @saved="editing = false; load()" @cancel="editing = false"></exam-form></div></div>
    <div class="card shadow-sm mb-3"><div class="card-body"><h6>Timeline</h6><div class="row small"><div class="col-md-3">Slot creation: {{ $fmt(exam.slot_creation_start) }} to {{ $fmt(exam.slot_creation_end) }}</div><div class="col-md-3">Booking: {{ $fmt(exam.booking_start) }} to {{ $fmt(exam.booking_end) }}</div></div><div class="mt-3"><button v-for="action in actions" :key="action[0]" class="btn btn-sm btn-primary me-2 mb-1" @click="act(action[0])">{{ action[1] }}</button><span v-if="!actions.length" class="text-muted small">No status actions available.</span></div></div></div>
    <div class="card shadow-sm mb-3"><div class="card-body"><div class="d-flex justify-content-between"><h6>Rubric ({{ rubricTotal }} / {{ exam.max_marks }} marks)</h6><button class="btn btn-sm btn-outline-primary" @click="rubricForm = { criterion: '', max_marks: 10, weightage: 1, description: '' }">+ Criterion</button></div>
      <form v-if="rubricForm" class="row g-2 my-2" @submit.prevent="saveRubric"><div class="col-md-4"><input class="form-control" v-model="rubricForm.criterion" placeholder="Criterion" required></div><div class="col-md-2"><input class="form-control" type="number" step="0.5" min="0.5" v-model.number="rubricForm.max_marks" required></div><div class="col-md-2"><input class="form-control" type="number" step="0.1" min="0.1" v-model.number="rubricForm.weightage" required></div><div class="col-md-4"><input class="form-control" v-model="rubricForm.description" placeholder="Description"></div><div class="col-12"><button class="btn btn-success btn-sm me-2">Save</button><button type="button" class="btn btn-light btn-sm" @click="rubricForm = null">Cancel</button></div></form>
      <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Criterion</th><th>Max</th><th>Weight</th><th>Description</th><th></th></tr></thead><tbody><tr v-for="rubric in exam.rubrics" :key="rubric.id"><td>{{ rubric.criterion }}</td><td>{{ rubric.max_marks }}</td><td>{{ rubric.weightage }}</td><td>{{ rubric.description }}</td><td class="text-end"><button class="btn btn-sm btn-link" @click="rubricForm = { ...rubric }">Edit</button><button class="btn btn-sm btn-link text-danger" @click="removeRubric(rubric)">Delete</button></td></tr><tr v-if="!exam.rubrics.length"><td colspan="5" class="text-muted text-center">No criteria yet</td></tr></tbody></table></div>
    </div></div>
    <div class="card shadow-sm mb-3"><div class="card-body"><h6>Assigned examiners</h6><div class="form-check" v-for="person in people" :key="person.id"><input class="form-check-input" type="checkbox" :id="'ex' + person.id" :value="person.id" v-model="selected"><label class="form-check-label" :for="'ex' + person.id">{{ person.name }} <span class="text-muted small">{{ person.department }}</span></label></div><p v-if="!people.length" class="text-muted small">No active examiners. Add some under People.</p><button class="btn btn-sm btn-primary mt-2" @click="saveExaminers">Save examiners</button></div></div>
    <div class="card shadow-sm"><div class="card-body" v-if="results"><div class="d-flex justify-content-between"><h6>Evaluations</h6><div><button v-if="!exam.results_published" class="btn btn-sm btn-success" @click="publish(true)">Publish results</button><button v-else class="btn btn-sm btn-outline-warning" @click="publish(false)">Unpublish</button></div></div><div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Student</th><th>Examiner</th><th>Marks</th><th>Remarks</th><th>Status</th></tr></thead><tbody><tr v-for="row in results.results" :key="row.booking_id"><td>{{ row.student }}</td><td>{{ row.examiner }}</td><td>{{ row.total_marks }} / {{ results.max_marks }}</td><td>{{ row.remarks }}</td><td><span class="badge" :class="'bg-' + $badge(row.status)">{{ row.status }}</span></td></tr><tr v-if="!results.results.length"><td colspan="5" class="text-muted text-center">No evaluations yet</td></tr></tbody></table></div></div></div>
  </div>`,
});

EZ.page('page-admin-people', {
  data: () => ({ tab: 'examiners', rows: [], query: '', form: null }),
  mounted() { this.load(); },
  watch: { tab() { this.query = ''; this.form = null; this.load(); } },
  methods: {
    async load() { const data = await EZ.run(() => EZ.api('GET', '/admin/' + this.tab + '?q=' + encodeURIComponent(this.query))); if (data) this.rows = data[this.tab]; },
    async save() { const result = await EZ.run(() => EZ.api('POST', '/admin/examiners', this.form), 'Examiner added'); if (result) { this.form = null; this.load(); } },
    async toggle(user) { const result = await EZ.run(() => EZ.api('PUT', '/admin/' + this.tab + '/' + user.id, { is_active: !user.is_active }), 'Updated'); if (result) this.load(); },
    async remove(user) { if (!confirm(`Delete ${user.name}?`)) return; const result = await EZ.run(() => EZ.api('DELETE', '/admin/examiners/' + user.id), 'Deleted'); if (result) this.load(); },
  },
  template: `
  <div><h3 class="mb-3">People</h3><ul class="nav nav-tabs mb-3"><li class="nav-item"><button class="nav-link" :class="{ active: tab === 'examiners' }" @click="tab = 'examiners'">Examiners</button></li><li class="nav-item"><button class="nav-link" :class="{ active: tab === 'students' }" @click="tab = 'students'">Students</button></li></ul>
    <div class="d-flex gap-2 mb-3"><form class="input-group" @submit.prevent="load"><input class="form-control" v-model="query" placeholder="Search name or email"><button class="btn btn-outline-secondary">Search</button></form><button v-if="tab === 'examiners'" class="btn btn-primary text-nowrap" @click="form = { name: '', email: '', password: '', department: '', phone: '' }">+ Examiner</button></div>
    <div class="card shadow-sm mb-3" v-if="form"><div class="card-body"><form class="row g-2" @submit.prevent="save"><div class="col-md-4"><input class="form-control" v-model="form.name" placeholder="Name" required minlength="2"></div><div class="col-md-4"><input class="form-control" type="email" v-model="form.email" placeholder="Email" required></div><div class="col-md-4"><input class="form-control" type="password" v-model="form.password" placeholder="Password (min 6)" required minlength="6"></div><div class="col-md-4"><input class="form-control" v-model="form.department" placeholder="Department"></div><div class="col-md-4"><input class="form-control" v-model="form.phone" placeholder="Phone"></div><div class="col-12"><button class="btn btn-success me-2">Save</button><button type="button" class="btn btn-light" @click="form = null">Cancel</button></div></form></div></div>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Name</th><th>Email</th><th>{{ tab === 'examiners' ? 'Department' : 'Roll no' }}</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="user in rows" :key="user.id"><td>{{ user.name }}</td><td>{{ user.email }}</td><td>{{ tab === 'examiners' ? user.department : user.roll_no }}</td><td><span class="badge" :class="user.is_active ? 'bg-success' : 'bg-secondary'">{{ user.is_active ? 'Active' : 'Disabled' }}</span></td><td class="text-end"><button class="btn btn-sm btn-outline-secondary me-1" @click="toggle(user)">{{ user.is_active ? 'Deactivate' : 'Activate' }}</button><button v-if="tab === 'examiners'" class="btn btn-sm btn-outline-danger" @click="remove(user)">Delete</button></td></tr><tr v-if="!rows.length"><td colspan="5" class="text-center text-muted">Nothing found</td></tr></tbody></table></div>
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
