const fs = require('fs-extra');
const fg = require('fast-glob');
const Handlebars = require('handlebars');
const marked = require('marked');
const matter = require('gray-matter');
const path = require('path');
const slug = require('slug');

const utils = require("./utils");

class Site {
    constructor(config) {
        this.config = config;
        this.pages = [];
        this.output = [];
    };
    
    async build() {
        console.time("Build Time");
        // remove public folder and add new, empty one
        await this.reset();
        await this.read();
        await this.render();
        await this.write();

        console.timeEnd("Build Time");
    };

    async reset() {
        await fs.remove(this.config.public);
        await fs.mkdirp(this.config.public);
    };

    async read() {
        // copy assets
        if (this.config.static) {
            await fs.copy(this.config.static, this.config.public);
        };

        // find partials and register them to handlebars
        const partials = await fg("**", { cwd: "templates/partials" });
        for (let i = 0; i < partials.length; i++) {
            const fileContent = await fs.readFile(`templates/partials/${partials[i]}`, 'utf8')
            Handlebars.registerPartial(partials[i].replace(".hbs", ""), fileContent);
        };

        // add each file to pagelist
        const files = await fg('**/*', { cwd: 'src' });
        for (let i = 0; i < files.length; i++) {
            const fileContent = await fs.readFile(`src/${files[i]}`, 'utf8');
            const frontmatter = matter(fileContent);

            const title = frontmatter.data.title ? frontmatter.data.title : files[i].replace(/\.[^/.]+$/, '');
            const permalink = frontmatter.data.permalink ? frontmatter.data.permalink : slug(title).toLowerCase();

            // add file to pages array
            this.pages.push({
                title,
                permalink,
                content: frontmatter.content,
                ...frontmatter.data
            });
        };
    };

    async render() {
        for (let i = 0; i < this.pages.length; i++) {
            // Rendering the initial page with the template engine
            let renderedContent = Handlebars.compile(this.pages[i].content)({
                site: { pages: this.pages, ...this.config },
                page: this.pages[i]
            });

            if (this.pages[i].markdown) {
                renderedContent = marked(renderedContent)
            };
      
            // rendering template and passing in the rendered content
            if (this.pages[i].layout) {
                const layout = await fs.readFile(
                    `templates/${this.pages[i].layout}.hbs`,
                    'utf8'
                );

                const template = Handlebars.compile(layout);
      
                renderedContent = template({
                    site: { pages: this.pages, ...this.config },
                    page: this.pages[i],
                    content: renderedContent
                });
            };
      
            // Outputs are objects with 2 keys, the output path and the file contents
            this.output.push({
              path: path.join(
                this.config.public,
                this.pages[i].permalink,
                'index.html'
              ),
              content: renderedContent
            });
        };
    };

    async write() {
        const outputs = [];

        for (let i = 0; i < this.output.length; i++) {
            outputs.push(fs.outputFile(this.output[i].path, this.output[i].content));
        };

        return Promise.all(outputs);
    };
};

function build() {
    utils
        .getConfig()
        .then(config => new Site(config))
        .then(site => site.build())
        .catch(e => console.log(e))
};

build();
