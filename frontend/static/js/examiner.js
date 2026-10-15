EZ.page('page-examiner-dashboard', {
  data: () => ({ dashboard: {}, exams: [] }),
  mounted() { this.load(); },
  methods: {
    async load() {
      const [dashboard, exams] = await Promise.all([EZ.run(() => EZ.api('GET', '/examiner/dashboard')), EZ.run(() => EZ.api('GET', '/examiner/exams'))]);
      if (dashboard) this.dashboard = dashboard;
      if (exams) this.exams = exams.exams;
    },
    async complete(exam) { const result = await EZ.run(() => EZ.api('POST', '/examiner/exams/' + exam.id + '/complete'), 'Marked as completed'); if (result) this.load(); },
  },
  template: `
  <div><h3 class="mb-3">Examiner dashboard</h3><div class="row g-3 mb-4"><div class="col-6 col-md-3" v-for="item in [['Assigned exams','assigned_exams'],['Slots created','slots_created'],['Booked students','booked_students'],['Pending evaluations','pending_evaluations']]" :key="item[1]"><div class="card card-stat text-center shadow-sm"><div class="card-body"><div class="display-6">{{ dashboard[item[1]] ?? '-' }}</div><div class="text-muted small">{{ item[0] }}</div></div></div></div></div>
    <h5>Assigned examinations</h5><div class="table-responsive"><table class="table bg-white align-middle"><thead><tr><th>Exam</th><th>Course</th><th>Type</th><th>Status</th><th>My slots</th><th>Pending</th><th></th></tr></thead><tbody><tr v-for="exam in exams" :key="exam.id"><td>{{ exam.name }}</td><td>{{ exam.course }}</td><td>{{ exam.exam_type }}</td><td><span class="badge" :class="'bg-' + $badge(exam.status)">{{ exam.status }}</span></td><td>{{ exam.slots }}</td><td>{{ exam.pending }}</td><td class="text-end"><button v-if="exam.status === 'Closed'" class="btn btn-sm btn-outline-success" @click="complete(exam)">Mark completed</button></td></tr><tr v-if="!exams.length"><td colspan="7" class="text-center text-muted">No exams assigned yet</td></tr></tbody></table></div>
  </div>`,
});

EZ.page('page-examiner-slots', {
  data: () => ({ exams: [], slots: [], form: null }),
  computed: { openExams() { return this.exams.filter(exam => exam.status === 'Slot Creation'); } },
  mounted() { this.load(); },
  methods: {
    async load() { const [exams, slots] = await Promise.all([EZ.run(() => EZ.api('GET', '/examiner/exams')), EZ.run(() => EZ.api('GET', '/examiner/slots'))]); if (exams) this.exams = exams.exams; if (slots) this.slots = slots.slots; },
    examStatus(id) { const exam = this.exams.find(item => item.id === id); return exam ? exam.status : ''; },
    editable(slot) { return slot.booked === 0 && this.examStatus(slot.exam_id) === 'Slot Creation'; },
    add() { this.form = { exam_id: this.openExams.length ? this.openExams[0].id : '', date: '', start_time: '', end_time: '', capacity: 1, meeting_link: '' }; },
    async save() { const form = this.form; const result = await EZ.run(() => form.id ? EZ.api('PUT', '/examiner/slots/' + form.id, form) : EZ.api('POST', '/examiner/slots', form), 'Slot saved'); if (result) { this.form = null; this.load(); } },
    async remove(slot) { if (!confirm('Delete this slot?')) return; const result = await EZ.run(() => EZ.api('DELETE', '/examiner/slots/' + slot.id), 'Deleted'); if (result) this.load(); },
  },
  template: `
  <div><div class="d-flex justify-content-between mb-3"><h3>My slots</h3><button class="btn btn-primary" :disabled="!openExams.length" @click="add">+ New slot</button></div><div v-if="!openExams.length" class="alert alert-info">Slot creation is not open for any of your exams right now.</div>
    <div class="card shadow-sm mb-3" v-if="form"><div class="card-body"><form class="row g-2" @submit.prevent="save"><div class="col-md-4"><select class="form-select" v-model.number="form.exam_id" required :disabled="!!form.id"><option v-for="exam in (form.id ? exams : openExams)" :key="exam.id" :value="exam.id">{{ exam.name }}</option></select></div><div class="col-md-2"><input class="form-control" type="date" v-model="form.date" required></div><div class="col-md-2"><input class="form-control" type="time" v-model="form.start_time" required></div><div class="col-md-2"><input class="form-control" type="time" v-model="form.end_time" required></div><div class="col-md-2"><input class="form-control" type="number" min="1" v-model.number="form.capacity" required placeholder="Capacity"></div><div class="col-md-8"><input class="form-control" type="url" v-model="form.meeting_link" placeholder="Meeting link (optional)"></div><div class="col-12"><button class="btn btn-success me-2">Save</button><button type="button" class="btn btn-light" @click="form = null">Cancel</button></div></form></div></div>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Exam</th><th>Date</th><th>Time</th><th>Booked</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="slot in slots" :key="slot.id"><td>{{ slot.exam }}</td><td>{{ slot.date }}</td><td>{{ slot.start_time }}-{{ slot.end_time }}</td><td>{{ slot.booked }} / {{ slot.capacity }}</td><td><span class="badge" :class="'bg-' + $badge(slot.status)">{{ slot.status }}</span></td><td class="text-end"><template v-if="editable(slot)"><button class="btn btn-sm btn-outline-primary me-1" @click="form = { ...slot }">Edit</button><button class="btn btn-sm btn-outline-danger" @click="remove(slot)">Delete</button></template></td></tr><tr v-if="!slots.length"><td colspan="6" class="text-center text-muted">No slots yet</td></tr></tbody></table></div>
  </div>`,
});

EZ.page('page-examiner-bookings', {
  data: () => ({ rows: [], exams: [], examId: '', pending: false }),
  async mounted() { const data = await EZ.run(() => EZ.api('GET', '/examiner/exams')); if (data) this.exams = data.exams; this.load(); },
  methods: {
    async load() { const params = new URLSearchParams({ exam_id: this.examId, pending: this.pending ? '1' : '' }); const data = await EZ.run(() => EZ.api('GET', '/examiner/bookings?' + params)); if (data) this.rows = data.bookings; },
  },
  template: `
  <div><h3 class="mb-3">Booked students</h3><div class="row g-2 mb-3 align-items-center"><div class="col-md-6"><select class="form-select" v-model="examId" @change="load"><option value="">All exams</option><option v-for="exam in exams" :key="exam.id" :value="exam.id">{{ exam.name }}</option></select></div><div class="col-md-4"><div class="form-check"><input class="form-check-input" type="checkbox" id="pending-only" v-model="pending" @change="load"><label class="form-check-label" for="pending-only">Pending evaluation only</label></div></div></div>
    <div class="table-responsive"><table class="table table-hover bg-white align-middle"><thead><tr><th>Student</th><th>Roll no</th><th>Exam</th><th>When</th><th>Evaluation</th><th>Marks</th><th></th></tr></thead><tbody><tr v-for="booking in rows" :key="booking.id"><td>{{ booking.student }}<div class="small text-muted">{{ booking.email }}</div></td><td>{{ booking.roll_no }}</td><td>{{ booking.exam }}</td><td>{{ booking.date }} {{ booking.start_time }}</td><td><span class="badge" :class="'bg-' + $badge(booking.evaluation_status)">{{ booking.evaluation_status }}</span></td><td>{{ booking.total_marks ?? '-' }}</td><td class="text-end"><a class="btn btn-sm btn-outline-primary" :href="'#/examiner/evaluate/' + booking.id">{{ booking.status === 'Completed' ? 'View / edit' : 'Evaluate' }}</a></td></tr><tr v-if="!rows.length"><td colspan="7" class="text-center text-muted">No students booked</td></tr></tbody></table></div>
  </div>`,
});

EZ.page('page-examiner-evaluate', {
  data: () => ({ data: null, remarks: '', busy: false }),
  computed: { total() { return this.data ? this.data.rubrics.reduce((sum, rubric) => sum + (Number(rubric.marks) || 0), 0) : 0; } },
  async mounted() { const result = await EZ.run(() => EZ.api('GET', '/examiner/bookings/' + this.params.id + '/evaluation')); if (result) { this.data = result; this.remarks = result.remarks || ''; } },
  methods: {
    async submit() {
      this.busy = true;
      const scores = this.data.rubrics.map(rubric => ({ rubric_id: rubric.id, marks: rubric.marks }));
      const result = await EZ.run(() => EZ.api('POST', '/examiner/bookings/' + this.params.id + '/evaluate', { scores, remarks: this.remarks }), 'Evaluation submitted');
      this.busy = false;
      if (result) EZ.go('#/examiner/bookings');
    },
  },
  template: `
  <div v-if="data" class="row justify-content-center"><div class="col-lg-8"><a href="#/examiner/bookings" class="small">&larr; Back</a><div class="card shadow-sm mt-2"><div class="card-body"><h4>{{ data.booking.student }} <span class="text-muted fs-6">{{ data.booking.exam }}</span></h4><p class="text-muted small">{{ data.booking.date }} {{ data.booking.start_time }}-{{ data.booking.end_time }}</p>
    <form @submit.prevent="submit"><div class="row g-2 mb-2 align-items-center" v-for="rubric in data.rubrics" :key="rubric.id"><div class="col-7"><b>{{ rubric.criterion }}</b><div class="small text-muted">{{ rubric.description }}</div></div><div class="col-5"><div class="input-group"><input class="form-control" type="number" step="0.5" min="0" :max="rubric.max_marks" v-model.number="rubric.marks" required><span class="input-group-text">/ {{ rubric.max_marks }}</span></div></div></div><div class="fs-5 my-3">Total: <b>{{ total }}</b> / {{ data.max_marks }}</div><textarea class="form-control mb-3" rows="3" v-model="remarks" placeholder="Remarks / feedback for the student"></textarea><button class="btn btn-success" :disabled="busy">{{ busy ? 'Submitting...' : 'Submit evaluation' }}</button></form>
  </div></div></div></div>`,
});
