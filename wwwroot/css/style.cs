
* {
margin: 0;
padding: 0;
    box - sizing: border - box;
}

html {
    scroll-behavior: smooth;
}

body {
    background: #faf8f4;
    color: #40352e;
    font - family: Georgia, serif;
}

.hero {
    min-height: 650px;
background: linear - gradient(
rgba(35, 25, 20, 0.35),
rgba(35, 25, 20, 0.35)
), url('/images/hero.jpg') center / cover;

display: flex;
justify - content: center;
align - items: center;
text - align: center;
color: white;
}

.hero - content h1 {
    font-size: clamp(40px, 6vw, 75px);
font - weight: normal;
margin: 20px 0;
}

.subtitle {
    letter-spacing: 4px;
font - size: 12px;
}

.hero - content p {
    margin: 15px 0;
}

.hero - button {
display: inline - block;
    margin - top: 25px;
padding: 16px 30px;
border: 1px solid white;
color: white;
    text - decoration: none;
    letter - spacing: 2px;
transition: 0.3s;
}

.hero - button:hover {
    background: white;
color: #40352e;
}

.collection {
    padding: 100px 20px;
text - align: center;
}

.collection h2
{
    font-size: 45px;
    font-weight: normal;
    margin-top: 20px;
}
