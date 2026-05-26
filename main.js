// main.js
document.addEventListener("DOMContentLoaded", () => {
    // Simulate loading time (e.g., waiting for assets or data)
    // Adjust the timeout duration as needed
    setTimeout(() => {
        const loader = document.getElementById('loader-wrapper');
        const mainContent = document.getElementById('main-content');

        // Fade out loader
        loader.style.opacity = '0';
        
        // Show main content immediately so layout is ready
        mainContent.style.display = 'flex';
        
        // Wait for loader fade out transition, then hide it completely and animate content in
        setTimeout(() => {
            loader.style.display = 'none';
            // Trigger CSS transition for main content
            requestAnimationFrame(() => {
                mainContent.classList.add('visible');
            });
        }, 500); // Matches the CSS transition duration of opacity

    }, 2500); // Show loading animation for 2.5 seconds
});
