let count = 0;

const btn = document.getElementById("btn");
const text = document.getElementById("count");

btn.onclick = () => {
    count++;
    text.textContent = count;
};