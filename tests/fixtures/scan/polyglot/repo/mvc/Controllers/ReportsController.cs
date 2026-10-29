[Route("reports/[action]")]
public class ReportsController : Controller
{
    public ActionResult Monthly() { return View(); }
}
