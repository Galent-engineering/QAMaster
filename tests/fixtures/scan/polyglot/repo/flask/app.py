@app.route('/login')
def login():
    return redirect('/dashboard')
@app.get("/reports/<int:year>")
def reports(year):
    return ''
