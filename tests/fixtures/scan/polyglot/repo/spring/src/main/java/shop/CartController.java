@Controller
@RequestMapping("/cart")
public class CartController {
  @GetMapping("/view") public String view() { return "cart"; }
  @PostMapping(value = "/checkout") public String checkout() { return "redirect:/cart/view"; }
}
