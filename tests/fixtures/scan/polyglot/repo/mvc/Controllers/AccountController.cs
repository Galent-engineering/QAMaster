public class AccountController : Controller
{
    public IActionResult Index() { return View(); }
    [HttpGet("Account/Profile/{id}")]
    public IActionResult Profile(int id) { return View(); }
    [HttpPost]
    public IActionResult Logout() { return RedirectToAction("Index", "Home"); }
}
