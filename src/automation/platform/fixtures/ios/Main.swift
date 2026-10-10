import UIKit

final class Controller: UIViewController {
    private let input = UITextField()
    private let output = UILabel()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        input.borderStyle = .roundedRect
        input.placeholder = "Name"
        input.accessibilityIdentifier = "fixture-name"
        input.accessibilityLabel = "Name"
        let button = UIButton(type: .system)
        button.setTitle("Continue", for: .normal)
        button.accessibilityIdentifier = "fixture-submit"
        button.addTarget(self, action: #selector(submit), for: .touchUpInside)
        output.text = "Ready"
        output.accessibilityIdentifier = "fixture-result"
        let stack = UIStackView(arrangedSubviews: [input, button, output])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 80),
            input.heightAnchor.constraint(equalToConstant: 48),
            button.heightAnchor.constraint(equalToConstant: 48)
        ])
    }
    @objc private func submit() {
        input.resignFirstResponder()
        output.text = "Welcome " + (input.text ?? "")
    }
}
@objc(SceneDelegate) final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = Controller()
        window?.makeKeyAndVisible()
    }
}
@main final class App: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}
